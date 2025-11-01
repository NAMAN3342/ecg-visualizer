/*
  ECG Calibration Square Wave (1 mV)
  ----------------------------------
  Sends a JSON line at 125 Hz with a 1 mV square wave on Lead II only; others zero.
  Use this to tune pixelsPerMm and gain so that 1 mV equals 10 mm on the paper grid.
*/

#include <Arduino.h>

static const uint32_t BAUD = 115200;
static const float SAMPLE_RATE_HZ = 125.0f;

void setup(){
  Serial.begin(BAUD);
  while(!Serial){ ; }
}

void loop(){
  static uint32_t lastMicros = micros();
  const uint32_t intervalUs = (uint32_t)(1000000.0f / SAMPLE_RATE_HZ);
  const uint32_t now = micros();
  if ((now - lastMicros) < intervalUs) return;
  lastMicros += intervalUs;

  static uint32_t count = 0;
  count++;
  // 1 mV amplitude, 2 Hz square wave (roughly)
  const bool high = ((count / (uint32_t)(SAMPLE_RATE_HZ/4)) % 2) == 0; // toggle every ~0.25s
  const float lead2 = high ? 1.0f : 0.0f; // mV

  Serial.print('{');
  Serial.print("\"lead1\":0.000,");
  Serial.print("\"lead2\":"); Serial.print(lead2,3); Serial.print(',');
  Serial.print("\"lead3\":0.000,");
  Serial.print("\"avr\":0.000,");
  Serial.print("\"avl\":0.000,");
  Serial.print("\"avf\":0.000");
  Serial.println('}');
}
