#include <Wire.h>
#include <Arduino.h>
//#include "esp32-hal-neopixel.h"

// MPU6050 I2C address
#define MPU_ADDR 0x68

// I2C pins
#define SDA_PIN 6
#define SCL_PIN 7

// Startup blink
#define STARTUP_BLINKS 5
#define BLINK_DELAY 200

// Smooth LED transition factor (0–1), smaller = slower
#define SMOOTHING 0.05

// Current RGB values for smoothing
float currentR = 0;
float currentG = 0;
float currentB = 0;

// Threshold for mapping acceleration
#define ACC_MIN 500     // minimal detectable movement
#define ACC_MAX 15000   // maximal movement

void setup() {
  Wire.begin(SDA_PIN, SCL_PIN);

  // Initialize MPU6050
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B); // PWR_MGMT_1 register
  Wire.write(0);    // wake up
  Wire.endTransmission(true);

  // Startup blink (purple)
  for (int i = 0; i < STARTUP_BLINKS; i++) {
    neopixelWrite(RGB_BUILTIN, 100, 0, 115);
    delay(BLINK_DELAY);
    neopixelWrite(RGB_BUILTIN, 0, 0, 0);
    delay(BLINK_DELAY);
  }
}

void loop() {
  int16_t ax, ay, az;

  // Read accelerometer data
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B); // ACCEL_XOUT_H
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 6, true);

  ax = (Wire.read() << 8 | Wire.read());
  ay = (Wire.read() << 8 | Wire.read());
  az = (Wire.read() << 8 | Wire.read());

  // Calculate total acceleration magnitude
  int16_t totalAccel = abs(ax) + abs(ay) + abs(az);

  // Map acceleration to color
  // Reversed: red = stationary, yellow = medium, green = high movement
  float rTarget, gTarget, bTarget;

  if (totalAccel <= ACC_MIN) {
    rTarget = 0; gTarget = 100; bTarget = 0;  // green (was red)
  } else if (totalAccel >= ACC_MAX) {
    rTarget = 100; gTarget = 0; bTarget = 0;  // red (was green)
  } else {
    // interpolate green -> yellow -> red
    float t = float(totalAccel - ACC_MIN) / float(ACC_MAX - ACC_MIN);
    if (t < 0.5) {
      // green -> yellow (increase red)
      rTarget = 2 * t * 100;
      gTarget = 100;
      bTarget = 0;
    } else {
      // yellow -> red (decrease green)
      rTarget = 100;
      gTarget = 100 * (1 - 2*(t-0.5));
      bTarget = 0;
    }
  }

  // Smooth transition
  currentR = currentR + SMOOTHING * (rTarget - currentR);
  currentG = currentG + SMOOTHING * (gTarget - currentG);
  currentB = currentB + SMOOTHING * (bTarget - currentB);

  neopixelWrite(RGB_BUILTIN, int(currentR), int(currentG), int(currentB));

  delay(50); // small delay
}
