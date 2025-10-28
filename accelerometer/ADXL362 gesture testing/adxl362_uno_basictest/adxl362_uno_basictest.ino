#include <SPI.h>
#include <ADXL362.h>

ADXL362 sens;

int x,y,z, t;

void setup() {
  Serial.begin(9600);
  sens.begin(10);
  sens.beginMeasure();
  Serial.begin("ADXL362");
}

void loop() {
  sens.readXYZTData(x,y,z,t);
  Serial.print("x:");
  Serial.print(x);
  Serial.print("\ty:");
  Serial.print(y);
  Serial.print("\tz:");
  Serial.print(z);
  Serial.print("\tt:");
  Serial.println(t);
  delay(100);
}