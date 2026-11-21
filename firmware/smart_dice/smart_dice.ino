// Smart Dice firmware for Seeed XIAO nRF52840 Sense.
// Reads the built-in LSM6DS3 accelerometer, works out which face is up from
// gravity, and notifies it over Bluetooth LE. Packet format: docs/protocol.md.
//
// Board package: Seeed nRF52 mbed-enabled Boards
// Libraries:     ArduinoBLE, Seeed Arduino LSM6DS3

#include <ArduinoBLE.h>
#include <LSM6DS3.h>
#include <Wire.h>

const char* SERVICE_UUID = "f0bd0001-2ae7-429a-8fe0-3aa48ebf8220";
const char* STATE_UUID   = "f0bd0002-2ae7-429a-8fe0-3aa48ebf8220";

const unsigned long SAMPLE_INTERVAL_MS = 50;   // 20 updates a second
const unsigned long STABLE_AFTER_MS    = 300;  // face must hold this long
const float FACE_THRESHOLD_G           = 0.8;  // gravity needed on one axis

struct __attribute__((packed)) StatePacket {
  int16_t ax;      // milli-g
  int16_t ay;
  int16_t az;
  uint8_t face;    // 1..6, 0 = no clear face
  uint8_t stable;  // 1 = face held for STABLE_AFTER_MS
};

LSM6DS3 imu(I2C_MODE, 0x6A);
BLEService diceService(SERVICE_UUID);
BLECharacteristic stateChar(STATE_UUID, BLERead | BLENotify, sizeof(StatePacket));

uint8_t lastFace = 0;
unsigned long faceSinceMs = 0;
unsigned long lastSampleMs = 0;

// Opposite faces add up to 7. Board top (+Z) is face 1.
uint8_t faceFromGravity(float ax, float ay, float az) {
  if (az >  FACE_THRESHOLD_G) return 1;
  if (ax >  FACE_THRESHOLD_G) return 2;
  if (ay >  FACE_THRESHOLD_G) return 3;
  if (ay < -FACE_THRESHOLD_G) return 4;
  if (ax < -FACE_THRESHOLD_G) return 5;
  if (az < -FACE_THRESHOLD_G) return 6;
  return 0;
}

void haltWithBlink() {
  while (true) {
    digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
    delay(150);
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);

  if (imu.begin() != 0) {
    Serial.println("IMU not found");
    haltWithBlink();
  }

  if (!BLE.begin()) {
    Serial.println("Bluetooth failed to start");
    haltWithBlink();
  }

  BLE.setLocalName("SmartDice");
  BLE.setDeviceName("SmartDice");
  BLE.setAdvertisedService(diceService);
  diceService.addCharacteristic(stateChar);
  BLE.addService(diceService);

  StatePacket empty = {0, 0, 0, 0, 0};
  stateChar.writeValue((const uint8_t*)&empty, sizeof(empty));

  BLE.advertise();
  Serial.println("SmartDice advertising");
}

void loop() {
  BLE.poll();

  unsigned long now = millis();
  if (now - lastSampleMs < SAMPLE_INTERVAL_MS) return;
  lastSampleMs = now;

  float ax = imu.readFloatAccelX();
  float ay = imu.readFloatAccelY();
  float az = imu.readFloatAccelZ();

  uint8_t face = faceFromGravity(ax, ay, az);
  if (face != lastFace) {
    lastFace = face;
    faceSinceMs = now;
    Serial.print("Face: ");
    Serial.println(face);
  }
  bool stable = face != 0 && (now - faceSinceMs) >= STABLE_AFTER_MS;

  StatePacket packet;
  packet.ax = (int16_t)(ax * 1000.0f);
  packet.ay = (int16_t)(ay * 1000.0f);
  packet.az = (int16_t)(az * 1000.0f);
  packet.face = face;
  packet.stable = stable ? 1 : 0;

  if (BLE.connected()) {
    stateChar.writeValue((const uint8_t*)&packet, sizeof(packet));
  }
}
