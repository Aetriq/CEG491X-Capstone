// Project EchoLog Group 2
// ADXL362 Arduino UNO ADXL362 Basic Test
// The objective of this code to establish basic connectivity and read values from the accelerometer module.
// Registers (with the exception of soft reset) are not written in this code.
// Author(s): Gordon, A., Spacek, A., Nyakaana, D., Escalante, A., Liu, Max.

// Pin Assignment
const int PIN_CS   = 10;   
const int PIN_MOSI = 8;   
const int PIN_MISO = 12;
const int PIN_SCK  = 7;

// Unit converting constants 
const float ACC_TEMP_BIAS = 350.0;     
const float ACC_TEMP_SENSITIVITY = 0.065;
const float G_TO_MS2 = 9.80665f;

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
  val  = spiTransferSoft(0x00);     
  val |= (spiTransferSoft(0x00) << 8);
  digitalWrite(PIN_CS, HIGH);
  return val;
}

// Helper to convert raw 16-bit left-justified pair to signed 12-bit 
int16_t toSigned12(int16_t raw16) {
  int16_t val12 = (raw16 >> 4) & 0x0FFF; 
  if (val12 & 0x800) { 
    val12 |= 0xF000; 
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
}

void loop() {
  int16_t rawX16, rawY16, rawZ16, rawT16;
  int16_t x12, y12, z12, t12;

  digitalWrite(PIN_CS, LOW);
  spiTransferSoft(0x0B);
  spiTransferSoft(0x0E); 
  rawX16 = spiTransferSoft(0x00);
  rawX16 |= (spiTransferSoft(0x00) << 8);
  rawY16 = spiTransferSoft(0x00);
  rawY16 |= (spiTransferSoft(0x00) << 8);
  rawZ16 = spiTransferSoft(0x00);
  rawZ16 |= (spiTransferSoft(0x00) << 8);
  rawT16 = spiTransferSoft(0x00);
  rawT16 |= (spiTransferSoft(0x00) << 8);
  digitalWrite(PIN_CS, HIGH);

  x12 = abs(toSigned12(rawX16));
  y12 = abs(toSigned12(rawY16));
  z12 = abs(toSigned12(rawZ16));
  t12 = abs(toSigned12(rawT16));

  // Convert to physical units
  float x_g = x12 * 0.001f - 0.04; 
  float y_g = y12 * 0.001f - 0.02;
  float z_g = z12 * 0.001f * -1 - 0.04;

  if(rawX16 > 1000 || rawX16 < -1000) { digitalWrite(13, HIGH); delay(100); digitalWrite(13, LOW); }
  if(rawY16 > 1000 || rawY16 < -1000) { digitalWrite(13, HIGH); delay(100); digitalWrite(13, LOW); }
  if(rawZ16 > 500 || rawZ16 < -500) { digitalWrite(13, HIGH); delay(100); digitalWrite(13, LOW); }

  // Convert to m/s^2
  float x_ms2 = x_g * G_TO_MS2; 
  float y_ms2 = y_g * G_TO_MS2;
  float z_ms2 = z_g * G_TO_MS2;

  float tempC = ((float)t12 - ACC_TEMP_BIAS ) * ACC_TEMP_SENSITIVITY;

  Serial.print("X: "); Serial.print(rawX16); Serial.print(": "); Serial.print(x_ms2, 3); Serial.print("m/s^2, "); Serial.print(x_g, 3); Serial.println("g"); 
  Serial.print("Y: "); Serial.print(rawY16); Serial.print(": "); Serial.print(y_ms2, 3); Serial.print("m/s^2, "); Serial.print(y_g, 3); Serial.println("g"); 
  Serial.print("Z: "); Serial.print(rawZ16); Serial.print(": "); Serial.print(z_ms2, 3); Serial.print("m/s^2, "); Serial.print(z_g, 3); Serial.println("g"); 
  Serial.print("T: "); Serial.print(rawT16); Serial.print(": "); Serial.print(tempC*-1, 2); Serial.println(" C");
  Serial.println();

  delay(100);
}
