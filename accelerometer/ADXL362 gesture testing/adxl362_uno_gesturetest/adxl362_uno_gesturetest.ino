// EchoLog Gesture Detection Test
// Hardware Required: ADXL362
// CEG4912 GROUP 2
// Simple ADXL362 autonomous motion-detect example
// Detects movement and raises INT1

#include <stdint.h>
#include <SPI.h>

#define CS 14

// Helper function for SPI write
void adxl362_write_reg(uint8_t reg, uint8_t value) {
    digitalWrite(CS, LOW);
    SPI.transfer(0x0A);     // Write command
    SPI.transfer(reg);      // Register address
    SPI.transfer(value);    // Data
    digitalWrite(CS, HIGH);
}

// Example: configure ADXL362 for motion interrupt
void adxl362_init_motion_detect(void) {

    // Soft reset
    adxl362_write_reg(0x1F, 0x52);
    delay(10);

    // Set measurement range and output data rate
    // FILTER_CTL (0x2C):
    // Bits [2:0] = ODR = 100 Hz (0b011)
    // Bits [6:4] = ±2 g range (0b000)
    // → 0x13 = 0001_0011
    adxl362_write_reg(0x2C, 0x13);

    // Set activity threshold (THRESH_ACT_L/H)
    // Threshold = 0x050 (~80 counts ≈ 0.2 g)
    adxl362_write_reg(0x20, 0x50); // LSB
    adxl362_write_reg(0x21, 0x00); // MSB

    // Set activity time (TIME_ACT)
    // Number of consecutive samples above threshold
    // ~0.5 s @100 Hz = 50 samples
    adxl362_write_reg(0x22, 0x32); 
    adxl362_write_reg(0x23, 0x00);

    // Configure Activity/Inactivity control
    // ACT_INACT_CTL (0x27):
    // Bit7: ACT enable = 1
    // Bit6: ACT referenced = 1 (compared to baseline)
    // Bits5:4: INACT enable = 0
    // Bits2:0: Enable all axes for activity detection
    // → 0x3F = 0b0011_1111
    adxl362_write_reg(0x27, 0x3F);

    // Map activity interrupt to INT1
    // INTMAP1 (0x2A): bit4 = ACT
    adxl362_write_reg(0x2A, 0x10);

    // Enable measurement mode
    // POWER_CTL (0x2D):
    // Bit1 = 1 → Measurement mode
    adxl362_write_reg(0x2D, 0x02);
}

void setup() {
  Serial.begin(115200);
  adxl362_init_motion_detect();
  Serial.println("ADXL362 motion detection initialized.");
}

void loop() {
  // Handled by ADP196
}
