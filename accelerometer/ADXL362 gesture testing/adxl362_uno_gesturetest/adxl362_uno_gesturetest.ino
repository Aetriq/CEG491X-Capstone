// Project EchoLog Group 2
// ADXL362 Arduino UNO ADXL362 with Gesture (Activity) Detection
// This code demonstrates basic connectivity, data reading, and
// configures the ADXL362 to trigger an interrupt on activity (like a tap or shake).
//
// This version uses *polling* of the STATUS register to detect gestures,
// which removes the dependency on the external interrupt pin wiring.
//
// Author(s): Gordon, A., Spacek, A., Nyakaana, D., Escalante, A., Liu, Max.

// --- Pin Assignment ---
const int PIN_CS = 10;
const int PIN_MOSI = 8;
const int PIN_MISO = 12;
const int PIN_SCK = 7;
// We are now polling, so the INT1 pin connection is not required for this code.
// const int PIN_INT1 = 2; // No longer needed for this debug approach

// --- Unit converting constants ---
const float ACC_TEMP_BIAS = 350.0;
const float ACC_TEMP_SENSITIVITY = 0.065;
const float G_TO_MS2 = 9.80665f;

// --- Global Variables ---
// A volatile boolean flag is no longer needed
// volatile bool gestureDetected = false;

// --- ISR (Interrupt Service Routine) ---
// No longer needed
/*
void handleGesture() {
  gestureDetected = true;
}
*/

// Transfer a byte over SPI to ADXL
byte spiTransferSoft(byte dataOut) {
  byte dataIn = 0;
  for (int i = 0; i < 8; i++) {
    digitalWrite(PIN_MOSI, (dataOut & 0x80) ? HIGH : LOW);
    dataOut <<= 1;

    digitalWrite(PIN_SCK, HIGH);
    delayMicroseconds(1);

    dataIn <<= 1;
    if (digitalRead(PIN_MISO)) dataIn |= 1;

    digitalWrite(PIN_SCK, LOW);
    delayMicroseconds(1);
  }
  return dataIn;
}

// Write ADXL register with value
void adxlWriteReg(byte reg, byte value) {
  digitalWrite(PIN_CS, LOW);
  spiTransferSoft(0x0A);
  spiTransferSoft(reg);
  spiTransferSoft(value);
  digitalWrite(PIN_CS, HIGH);
}

// Read existing ADXL register value
byte adxlReadReg(byte reg) {
  byte val;
  digitalWrite(PIN_CS, LOW);
  spiTransferSoft(0x0B);
  spiTransferSoft(reg);
  val = spiTransferSoft(0x00);
  digitalWrite(PIN_CS, HIGH);
  return val;
}

// Read existing ADXL registers values and perform shift 8-bit left, returning signed 16-bit integer
int16_t adxlRead2Reg(byte reg) {
  int16_t val;
  digitalWrite(PIN_CS, LOW);
  spiTransferSoft(0x0B);
  spiTransferSoft(reg);
  val = spiTransferSoft(0x00);
  val |= (spiTransferSoft(0x00) << 8);
  digitalWrite(PIN_CS, HIGH);
  return val;
}

// Helper to convert raw 16-bit left-justified pair to signed 12-bit
int16_t toSigned12(int16_t raw16) {
  int16_t val12 = (raw16 >> 4) & 0x0FFF;
  if (val12 & 0x800) { // Check if the 12th bit (sign bit) is set
    val12 |= 0xF000; // Perform sign extension
  }
  return val12;
}

void setup() {
  Serial.begin(9600);

  //Pin assignment
  pinMode(PIN_CS, OUTPUT);
  pinMode(PIN_MOSI, OUTPUT);
  pinMode(PIN_MISO, INPUT);
  pinMode(PIN_SCK, OUTPUT);

  // Set up the interrupt pin as an input with an internal pull-up resistor
  // pinMode(PIN_INT1, INPUT_PULLUP); // No longer needed

  digitalWrite(PIN_CS, HIGH);
  digitalWrite(PIN_SCK, LOW);

  // Latency w/ ADXL before writing next instructions
  delay(100);

  // Soft reset
  adxlWriteReg(0x1F, 0x52);
  delay(10);

  // Set power mode to measure and prevent autosleep/noise
  byte pctl = adxlReadReg(0x2D);
  adxlWriteReg(0x2D, pctl | 0x02);
  delay(10);

  // --- Gesture (Activity) Detection Setup ---
  Serial.println("Configuring gesture (activity) detection...");

  // Set activity threshold to ~150mg (0x0096)
  // (Value is 11-bit, 1mg/LSB in 2g range)
  // Lowered from 300mg for better sensitivity.
  adxlWriteReg(0x20, 0x96); // THRESH_ACT_L (was 0x2C)
  adxlWriteReg(0x21, 0x00); // THRESH_ACT_H (was 0x01)

  // Set activity time to 1 sample (at 100Hz ODR, this is 10ms)
  // Lowered from 5. This is much better for detecting a quick "tap".
  adxlWriteReg(0x22, 0x01); // TIME_ACT (was 0x05)

  // Enable activity detection (absolute mode)
  // 0x01 = Activity Enabled, Absolute Mode
  adxlWriteReg(0x27, 0x01); // ACT_INACT_CTL

  // Map the AWAKE (activity) interrupt to the INT1 pin
  // 0x10 = AWAKE bit
  // This is still good to have, as it enables the AWAKE bit in the status reg
  adxlWriteReg(0x2A, 0x10); // INTMAP1

  // Attach the ISR function (handleGesture) to the interrupt pin (PIN_INT1)
  // attachInterrupt(digitalPinToInterrupt(PIN_INT1), handleGesture, RISING); // No longer needed
  
  Serial.println("Gesture detection configured. Waiting for activity (polling)...");
  // --- End Gesture Setup ---
}

void loop() {
  // --- Check for Gesture by Polling Status Register ---
  // This is the new debugging method.
  // We read the STATUS register (0x0B) directly.
  byte status = adxlReadReg(0x0B);

  // Check if the AWAKE bit (bit 6, which is 0x40) is set.
  if (status & 0x40) {
    Serial.println();
    Serial.println("***************************");
    Serial.println("Gesture (Activity) Detected! (Polled)");
    Serial.print("ADXL Status Register: 0x"); Serial.println(status, HEX);
    Serial.println("***************************");
    Serial.println();
    // Reading the status register automatically clears the bit,
    // so the interrupt is now reset and ready for the next event.
  }

  /*
  // --- Check for Gesture ---
  // This old block is replaced by the polling method above
  if (gestureDetected) {
    ...
    gestureDetected = false; // Reset the flag
  }
  */

  // --- Read Data ---
  int16_t rawX16, rawY16, rawZ16, rawT16;
  int16_t x12, y12, z12, t12;

  // Perform a burst read for X, Y, Z, and Temp data
  digitalWrite(PIN_CS, LOW);
  spiTransferSoft(0x0B); // Read command
  spiTransferSoft(0x0E); // Start at XDATA_L
  rawX16 = spiTransferSoft(0x00);
  rawX16 |= (spiTransferSoft(0x00) << 8);
  rawY16 = spiTransferSoft(0x00);
  rawY16 |= (spiTransferSoft(0x00) << 8);
  rawZ16 = spiTransferSoft(0x00);
  rawZ16 |= (spiTransferSoft(0x00) << 8);
  rawT16 = spiTransferSoft(0x00);
  rawT16 |= (spiTransferSoft(0x00) << 8);
  digitalWrite(PIN_CS, HIGH);

  // Convert to signed 12-bit values (removed abs())
  x12 = toSigned12(rawX16);
  y12 = toSigned12(rawY16);
  z12 = toSigned12(rawZ16);
  t12 = toSigned12(rawT16);

  // --- Process and Print Data ---

  // Convert to physical units (now using signed values)
  float x_g = x12 * 0.001f - 0.04;
  float y_g = y12 * 0.001f - 0.02;
  float z_g = z12 * 0.001f * -1 - 0.04;

  // This old block is no longer needed, the interrupt handles it!
  // if(rawX16 > 1000 || rawX16 < -1000) { ... }
  // if(rawY16 > 1000 || rawY16 < -1000) { ... }
  // if(rawZ16 > 500 || rawZ16 < -500) { ... }

  // Convert to m/s^2
  float x_ms2 = x_g * G_TO_MS2;
  float y_ms2 = y_g * G_TO_MS2;
  float z_ms2 = z_g * G_TO_MS2;

  // Calculate temperature (now using signed t12)
  float tempC = ((float)t12 - ACC_TEMP_BIAS ) * ACC_TEMP_SENSITIVITY;

  Serial.print("X: "); Serial.print(rawX16); Serial.print(": "); Serial.print(x_ms2, 3); Serial.print("m/s^2, "); Serial.print(x_g, 3); Serial.println("g");
  Serial.print("Y: "); Serial.print(rawY16); Serial.print(": "); Serial.print(y_ms2, 3); Serial.print("m/s^2, "); Serial.print(y_g, 3); Serial.println("g");
  Serial.print("Z: "); Serial.print(rawZ16); Serial.print(": "); Serial.print(z_ms2, 3); Serial.print("m/s^2, "); Serial.print(z_g, 3); Serial.println("g");
  Serial.print("T: "); Serial.print(rawT16); Serial.print(": "); Serial.print(tempC * -1, 2); Serial.println(" C"); // Kept your * -1
  Serial.println();

  delay(100);
}