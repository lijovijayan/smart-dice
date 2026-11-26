#include <ArduinoBLE.h>
#include <LSM6DS3.h>
#include <Wire.h>

const char* SERVICE_UUID = "f0bd0001-2ae7-429a-8fe0-3aa48ebf8220";
const char* STATE_UUID   = "f0bd0002-2ae7-429a-8fe0-3aa48ebf8220";

const unsigned long SAMPLE_INTERVAL_MS = 50;
const unsigned long STABLE_AFTER_MS    = 300;
const float FACE_THRESHOLD_G           = 0.8;

const bool LOG_SAMPLES                 = false;
const unsigned long SERIAL_WAIT_MS     = 2000;

const unsigned long BLINK_EVERY_MS     = 5000;
const unsigned long BLINK_LENGTH_MS    = 60;

const unsigned long AUTO_SLEEP_MS      = 60000;
const unsigned long SLEEP_SAMPLE_MS    = 500;
const unsigned long SLEEP_YIELD_MS     = 10;
const float MOVE_G                     = 0.08;
const float WAKE_G                     = 0.25;

#ifndef LED_STATE_ON
#define LED_STATE_ON HIGH
#endif

struct __attribute__((packed)) StatePacket {
  int16_t ax;
  int16_t ay;
  int16_t az;
  uint8_t face;
  uint8_t stable;
};

LSM6DS3 imu(I2C_MODE, 0x6A);
BLEService diceService(SERVICE_UUID);
BLECharacteristic stateChar(STATE_UUID, BLERead | BLENotify, sizeof(StatePacket));

uint8_t lastFace = 0;
bool lastStable = false;
bool wasConnected = false;
unsigned long faceSinceMs = 0;
unsigned long lastSampleMs = 0;
unsigned long lastBlinkMs = 0;
unsigned long blinkStartMs = 0;
bool blinking = false;

bool asleep = false;
unsigned long lastMotionMs = 0;
bool haveLastSample = false;
float lastAx = 0, lastAy = 0, lastAz = 0;
float restAx = 0, restAy = 0, restAz = 0;

uint8_t faceFromGravity(float ax, float ay, float az) {
  if (az >  FACE_THRESHOLD_G) return 1;
  if (ax >  FACE_THRESHOLD_G) return 2;
  if (ay >  FACE_THRESHOLD_G) return 3;
  if (ay < -FACE_THRESHOLD_G) return 4;
  if (ax < -FACE_THRESHOLD_G) return 5;
  if (az < -FACE_THRESHOLD_G) return 6;
  return 0;
}

bool logging() {
  return Serial;
}

void setLed(bool on) {
  digitalWrite(LED_BUILTIN, on ? LED_STATE_ON : (LED_STATE_ON == HIGH ? LOW : HIGH));
}

void updateHeartbeat(unsigned long now) {
  if (!blinking && now - lastBlinkMs >= BLINK_EVERY_MS) {
    lastBlinkMs = now;
    blinkStartMs = now;
    blinking = true;
    setLed(true);
  } else if (blinking && now - blinkStartMs >= BLINK_LENGTH_MS) {
    blinking = false;
    setLed(false);
  }
}

void logReading(float ax, float ay, float az) {
  Serial.print("ax=");
  Serial.print(ax, 2);
  Serial.print(" ay=");
  Serial.print(ay, 2);
  Serial.print(" az=");
  Serial.print(az, 2);
  Serial.print(" g");
}

float biggestChange(float ax, float ay, float az, float bx, float by, float bz) {
  float dx = fabs(ax - bx);
  float dy = fabs(ay - by);
  float dz = fabs(az - bz);
  float biggest = dx > dy ? dx : dy;
  return biggest > dz ? biggest : dz;
}

void goToSleep(float ax, float ay, float az) {
  asleep = true;
  restAx = ax;
  restAy = ay;
  restAz = az;
  if (logging()) {
    Serial.print("Asleep: no movement for ");
    Serial.print(AUTO_SLEEP_MS / 1000);
    Serial.println(" s. Move the die or connect the dashboard to wake it.");
  }
}

void wakeUp(unsigned long now, const char* reason) {
  asleep = false;
  lastMotionMs = now;
  if (logging()) {
    Serial.print("Awake: ");
    Serial.println(reason);
  }
}

void haltWithBlink(const char* reason) {
  unsigned long blinks = 0;
  while (true) {
    digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
    if (blinks++ % 16 == 0 && logging()) Serial.println(reason);
    delay(150);
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);

  unsigned long waitStart = millis();
  while (!Serial && millis() - waitStart < SERIAL_WAIT_MS) delay(10);

  if (logging()) {
    Serial.println();
    Serial.println("Smart Dice starting");
  }

  if (imu.begin() != 0) {
    haltWithBlink("IMU not found");
  }
  if (logging()) Serial.println("IMU ready");

  if (!BLE.begin()) {
    haltWithBlink("Bluetooth failed to start");
  }

  BLE.setLocalName("SmartDice");
  BLE.setDeviceName("SmartDice");
  BLE.setAdvertisedService(diceService);
  diceService.addCharacteristic(stateChar);
  BLE.addService(diceService);

  StatePacket empty = {0, 0, 0, 0, 0};
  stateChar.writeValue((const uint8_t*)&empty, sizeof(empty));

  BLE.advertise();
  if (logging()) {
    Serial.print("SmartDice advertising, address ");
    Serial.println(BLE.address());
  }
}

void loop() {
  BLE.poll();
  updateHeartbeat(millis());

  bool connected = BLE.connected();
  if (connected != wasConnected) {
    wasConnected = connected;
    if (connected) {
      if (asleep) wakeUp(millis(), "dashboard connected");
      if (logging()) {
        Serial.print("Connected: ");
        Serial.println(BLE.central().address());
      }
    } else {
      BLE.advertise();
      if (logging()) Serial.println("Disconnected, advertising again");
    }
  }

  unsigned long now = millis();
  unsigned long interval = asleep ? SLEEP_SAMPLE_MS : SAMPLE_INTERVAL_MS;
  if (now - lastSampleMs < interval) {
    if (asleep) delay(SLEEP_YIELD_MS);
    return;
  }
  lastSampleMs = now;

  float ax = imu.readFloatAccelX();
  float ay = imu.readFloatAccelY();
  float az = imu.readFloatAccelZ();

  if (asleep) {
    if (biggestChange(ax, ay, az, restAx, restAy, restAz) < WAKE_G) return;
    wakeUp(now, "the die moved");
  }

  if (haveLastSample && biggestChange(ax, ay, az, lastAx, lastAy, lastAz) >= MOVE_G) {
    lastMotionMs = now;
  }
  lastAx = ax;
  lastAy = ay;
  lastAz = az;
  haveLastSample = true;

  if (AUTO_SLEEP_MS > 0 && !connected && now - lastMotionMs >= AUTO_SLEEP_MS) {
    goToSleep(ax, ay, az);
    return;
  }

  uint8_t face = faceFromGravity(ax, ay, az);
  if (face != lastFace) {
    lastFace = face;
    faceSinceMs = now;
    if (logging()) {
      Serial.print("Face: ");
      if (face == 0) Serial.print("none");
      else Serial.print(face);
      Serial.print("  (");
      logReading(ax, ay, az);
      Serial.println(")");
    }
  }
  bool stable = face != 0 && (now - faceSinceMs) >= STABLE_AFTER_MS;
  if (stable != lastStable) {
    lastStable = stable;
    if (stable && logging()) {
      Serial.print("Rolled: ");
      Serial.println(face);
    }
  }
  if (LOG_SAMPLES && logging()) {
    logReading(ax, ay, az);
    Serial.print("  face=");
    Serial.print(face);
    Serial.print(" stable=");
    Serial.println(stable ? 1 : 0);
  }

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
