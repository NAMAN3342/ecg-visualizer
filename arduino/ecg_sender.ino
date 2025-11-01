/*
  ECG JSON Sender @125 Hz
  ----------------------------------
  Emits one JSON object per line with fields:
  {"lead1":..., "lead2":..., "lead3":..., "avr":..., "avl":..., "avf":...}

  Modes:
  - SIMULATED (default): generates a synthetic ECG waveform in mV for quick testing.
  - ANALOG: read from analog pins and compute derived leads; update pin mapping as needed.

  Set MODE_SIMULATED to false to switch to analog mode.
*/

#include <Arduino.h>

// ===== Configuration =====
static const bool MODE_SIMULATED = true;   // set false to read analog
static const uint32_t BAUD = 115200;
static const float SAMPLE_RATE_HZ = 125.0f;

// Analog pin mapping (if MODE_SIMULATED=false)
// Expecting differential front-end producing Lead I (LA-RA) and Lead II (LL-RA) as analog voltages.
// If you only have raw electrodes to single-ended ADC, you'll need instrumentation amps; otherwise keep simulated.
static const uint8_t PIN_LEAD_I  = A0; // Lead I analog input (mV scaled)
static const uint8_t PIN_LEAD_II = A1; // Lead II analog input (mV scaled)

// ===== Helpers =====
static const float TWO_PI_F = 6.28318530718f;

// Simple synthetic ECG generator (very lightweight) returning mV
float ecgSynth(float t) {
  // base HR ~ 60 bpm
  const float hr = 60.0f;
  const float period = 60.0f / hr; // seconds per beat
  float x = fmod(t, period) / period; // 0..1 within beat

  // Build a toy waveform: P (0.1 mV), QRS (1 mV), T (0.3 mV)
  float v = 0.0f;
  // P wave
  if (x > 0.10f && x < 0.18f) {
    float xp = (x-0.10f)/(0.08f);
    v += 0.15f * sin(TWO_PI_F * xp);
  }
  // QRS complex
  if (x > 0.20f && x < 0.24f) v -= 0.3f; // Q
  if (x > 0.24f && x < 0.26f) v += 1.0f; // R
  if (x > 0.26f && x < 0.30f) v -= 0.2f; // S
  // T wave
  if (x > 0.40f && x < 0.56f) {
    float xt = (x-0.40f)/(0.16f);
    v += 0.35f * sin(TWO_PI_F * xt * 0.5f);
  }
  // add a tiny baseline wander
  v += 0.05f * sin(TWO_PI_F * (t * 0.3f));
  return v; // millivolts
}

void setup(){
  Serial.begin(BAUD);
  while(!Serial){ ; }
  if (!MODE_SIMULATED){
    pinMode(PIN_LEAD_I, INPUT);
    pinMode(PIN_LEAD_II, INPUT);
  }
}

void loop(){
  static uint32_t lastMicros = micros();
  const uint32_t intervalUs = (uint32_t)(1000000.0f / SAMPLE_RATE_HZ);
  const uint32_t now = micros();
  if ((now - lastMicros) < intervalUs) return;
  lastMicros += intervalUs;

  float lead1, lead2, lead3, avr, avl, avf;

  if (MODE_SIMULATED){
    static float t = 0.0f;
    t += 1.0f / SAMPLE_RATE_HZ;
    // Create two slightly different leads
    lead1 = ecgSynth(t);
    lead2 = ecgSynth(t + 0.005f);
    lead3 = lead2 - lead1;         // Einthoven's law: III = II - I
    float la = lead1;               // approximate limb potentials
    float ll = lead2;
    float ra = 0.0f;                // reference
    avr = ra - (la + ll)/2.0f;      // augmented
    avl = la - (ra + ll)/2.0f;
    avf = ll - (ra + la)/2.0f;
  } else {
    // Read analog (assumed scaled to mV via front-end). If your inputs are raw ADC counts, convert as needed.
    float leadI_mv  = analogRead(PIN_LEAD_I);   // replace with your conversion to mV
    float leadII_mv = analogRead(PIN_LEAD_II);  // replace with your conversion to mV
    lead1 = leadI_mv;
    lead2 = leadII_mv;
    lead3 = lead2 - lead1;
    float la = lead1; float ll = lead2; float ra = 0.0f;
    avr = ra - (la + ll)/2.0f;
    avl = la - (ra + ll)/2.0f;
    avf = ll - (ra + la)/2.0f;
  }

  // Emit JSON line (values are in mV when simulated mode is on)
  Serial.print('{');
  Serial.print("\"lead1\":"); Serial.print(lead1, 3); Serial.print(',');
  Serial.print("\"lead2\":"); Serial.print(lead2, 3); Serial.print(',');
  Serial.print("\"lead3\":"); Serial.print(lead3, 3); Serial.print(',');
  Serial.print("\"avr\":"); Serial.print(avr, 3); Serial.print(',');
  Serial.print("\"avl\":"); Serial.print(avl, 3); Serial.print(',');
  Serial.print("\"avf\":"); Serial.print(avf, 3);
  Serial.println('}');
}
