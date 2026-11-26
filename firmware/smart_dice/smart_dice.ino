#include <ArduinoBLE.h>
#include <LSM6DS3.h>
#include <Wire.h>

const char* SERVICE_UUID = "f0bd0001-2ae7-429a-8fe0-3aa48ebf8220";
const char* STATE_UUID   = "f0bd0002-2ae7-429a-8fe0-3aa48ebf8220";

const unsigned long SAMPLE_INTERVAL_MS = 50;
const unsigned long STABLE_AFTER_MS    = 300;
const float FACE_THRESHOLD_G           = 0.8;

const unsigned long BLINK_EVERY_MS     = 5000;
const unsigned long BLINK_LENGTH_MS    = 60;

const unsigned long SLEEP_AFTER_MS           = 60000;
const unsigned long SLEEP_AFTER_CONNECTED_MS = 180000;
const unsigned long SLEEP_SAMPLE_MS          = 500;
const unsigned long SLEEP_YIELD_MS           = 10;
const float MOVE_G                           = 0.08;
const float WAKE_G                           = 0.25;
const uint8_t SLEEP_IN_OFF                   = 255;

#ifndef LED_STATE_ON
#define LED_STATE_ON HIGH
#endif

struct __attribute__((packed)) StatePacket {
  int16_t ax;
  int16_t ay;
  int16_t az;
  uint8_t face;
  uint8_t stable;
  uint8_t sleepIn;
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

void setLed(bool on) {
  digitalWrite(LED_BUILTIN, on ? LED_STATE_ON : (LED_STATE_ON == HIGH ? LOW : HIGH));
}

void updateHeartbeat(unsigned long now) {
  if (asleep) return;
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

float biggestChange(float ax, float ay, float az, float bx, float by, float bz) {
  float dx = fabs(ax - bx);
  float dy = fabs(ay - by);
  float dz = fabs(az - bz);
  float biggest = dx > dy ? dx : dy;
  return biggest > dz ? biggest : dz;
}

unsigned long sleepTimeoutMs() {
  return BLE.connected() ? SLEEP_AFTER_CONNECTED_MS : SLEEP_AFTER_MS;
}

uint8_t secondsUntilSleep(unsigned long now) {
  unsigned long timeout = sleepTimeoutMs();
  if (timeout == 0) return SLEEP_IN_OFF;
  unsigned long idle = now - lastMotionMs;
  if (idle >= timeout) return 0;
  unsigned long left = (timeout - idle + 999) / 1000;
  return left > 254 ? 254 : (uint8_t)left;
}

StatePacket buildPacket(float ax, float ay, float az, uint8_t face, bool stable, uint8_t sleepIn) {
  StatePacket packet;
  packet.ax = (int16_t)(ax * 1000.0f);
  packet.ay = (int16_t)(ay * 1000.0f);
  packet.az = (int16_t)(az * 1000.0f);
  packet.face = face;
  packet.stable = stable ? 1 : 0;
  packet.sleepIn = sleepIn;
  return packet;
}

void pollBle(int times) {
  for (int i = 0; i < times; i++) {
    BLE.poll();
    delay(25);
  }
}

void goToSleep(float ax, float ay, float az) {
  asleep = true;
  restAx = ax;
  restAy = ay;
  restAz = az;

  if (BLE.connected()) {
    StatePacket last = buildPacket(ax, ay, az, lastFace, lastStable, 0);
    stateChar.writeValue((const uint8_t*)&last, sizeof(last));
    pollBle(6);
    BLE.disconnect();
  }
  pollBle(6);
  BLE.stopAdvertise();

  blinking = false;
  setLed(false);
}

void wakeUp(unsigned long now) {
  asleep = false;
  lastMotionMs = now;
  BLE.advertise();
}

void haltWithBlink() {
  while (true) {
    digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
    delay(150);
  }
}

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);

  imu.settings.gyroEnabled = 0;
  imu.settings.accelSampleRate = 52;
  if (imu.begin() != 0) {
    haltWithBlink();
  }

  if (!BLE.begin()) {
    haltWithBlink();
  }

  BLE.setLocalName("SmartDice");
  BLE.setDeviceName("SmartDice");
  BLE.setAdvertisedService(diceService);
  diceService.addCharacteristic(stateChar);
  BLE.addService(diceService);

  StatePacket empty = buildPacket(0, 0, 0, 0, false, SLEEP_IN_OFF);
  stateChar.writeValue((const uint8_t*)&empty, sizeof(empty));

  BLE.advertise();
}

void loop() {
  BLE.poll();
  updateHeartbeat(millis());

  bool connected = BLE.connected();
  if (connected != wasConnected) {
    wasConnected = connected;
    if (connected) {
      lastMotionMs = millis();
    } else if (!asleep) {
      BLE.advertise();
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
    wakeUp(now);
  }

  if (haveLastSample && biggestChange(ax, ay, az, lastAx, lastAy, lastAz) >= MOVE_G) {
    lastMotionMs = now;
  }
  lastAx = ax;
  lastAy = ay;
  lastAz = az;
  haveLastSample = true;

  unsigned long timeout = sleepTimeoutMs();
  if (timeout > 0 && now - lastMotionMs >= timeout) {
    goToSleep(ax, ay, az);
    return;
  }

  uint8_t face = faceFromGravity(ax, ay, az);
  if (face != lastFace) {
    lastFace = face;
    faceSinceMs = now;
  }
  bool stable = face != 0 && (now - faceSinceMs) >= STABLE_AFTER_MS;
  lastStable = stable;

  if (connected) {
    StatePacket packet = buildPacket(ax, ay, az, face, stable, secondsUntilSleep(now));
    stateChar.writeValue((const uint8_t*)&packet, sizeof(packet));
  }
}
