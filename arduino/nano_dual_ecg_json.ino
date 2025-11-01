/*
  Arduino Nano Dual-Input ECG -> JSON (6 leads) @125 Hz
  -----------------------------------------------------
  Reads two analog channels (Lead I: LA-RA on A0, Lead II: LL-RA on A1),
  applies a cascaded IIR filter per channel (separate state), performs a
  quick 5s auto-calibration (baseline + gain), and streams one JSON object
  per line compatible with the React ECG visualizer.

  JSON line format (values in millivolts):
    {"lead1":<mV>, "lead2":<mV>, "lead3":<mV>, "avr":<mV>, "avl":<mV>, "avf":<mV>}

  Notes
  - Set MV_PER_UNIT to define how your filtered units map to mV. If you set
    REF_MV=1.0 and calibrate on a 1 mV reference, you'll get ~true mV.
  - If your amplifier polarity is flipped, set INVERT_CH1/INVERT_CH2 to true.
  - Keep the web app "Input Units" set to mV.
*/

// Note: In Arduino IDE, you don't need to include Arduino.h in .ino files;
// the IDE injects it automatically. If you previously saw "Arduino.h not found",
// compiling the sketch as a plain C++ file or outside the Arduino build system
// was likely the cause. Keeping it omitted for maximum compatibility.

// ===== User config =====
#define SAMPLE_RATE_HZ       125
#define BAUD_RATE            115200
#define INPUT_PIN1           A0   // Lead I  (LA - RA)
#define INPUT_PIN2           A1   // Lead II (LL - RA)
#define CALIBRATION_TIME_MS  5000 // 5s auto-cal

// Mapping from internal units to millivolts
static const float MV_PER_UNIT = 1.0f; // 1.0 -> treat filtered units as mV
static const float REF_MV      = 1.0f; // Target amplitude during auto-gain
static const bool  INVERT_CH1  = false;
static const bool  INVERT_CH2  = false;

// ===== Filter definition (4 cascaded biquads, separate state per channel) =====
struct Biquad { float a1, a2, b0, b1, b2; float z1, z2; };

static Biquad st[2][4]; // [channel][stage]

static inline float processStage(Biquad &s, float in){
  float x = in - s.a1 * s.z1 - s.a2 * s.z2;
  float out = s.b0 * x + s.b1 * s.z1 + s.b2 * s.z2;
  s.z2 = s.z1; s.z1 = x;
  return out;
}

static inline float ECGFilter(int ch, float input){
  float y = input;
  for(int i=0;i<4;i++) y = processStage(st[ch][i], y);
  return y;
}

static void initFilter(){
  // Stage coefficients copied from user's original cascades (a0 normalized to 1)
  // Stage 1
  st[0][0] = st[1][0] = { 0.70682283f, 0.15621030f, 0.28064917f, 0.56129834f, 0.28064917f, 0.0f, 0.0f };
  // Stage 2
  st[0][1] = st[1][1] = { 0.95028224f, 0.54073140f, 1.00000000f, 2.00000000f, 1.00000000f, 0.0f, 0.0f };
  // Stage 3 (note a1 negative in original, we store actual signed a1)
  st[0][2] = st[1][2] = { -1.95360385f, 0.95423412f, 1.00000000f, -2.00000000f, 1.00000000f, 0.0f, 0.0f };
  // Stage 4 (note a1 negative)
  st[0][3] = st[1][3] = { -1.98048558f, 0.98111344f, 1.00000000f, -2.00000000f, 1.00000000f, 0.0f, 0.0f };
}

// ===== Calibration state =====
static bool calibrated = false;
static unsigned long calibStartMs = 0;
static float min1_ =  1e9f, max1_ = -1e9f;
static float min2_ =  1e9f, max2_ = -1e9f;
static float baseline1 = 0.0f, baseline2 = 0.0f;
static float gain1 = 1.0f, gain2 = 1.0f;

void setup(){
  Serial.begin(BAUD_RATE);
  while(!Serial){;}
  initFilter();
  calibStartMs = millis();
}

static inline void updateCalibration(float f1, float f2){
  if (f1 < min1_) min1_ = f1; if (f1 > max1_) max1_ = f1;
  if (f2 < min2_) min2_ = f2; if (f2 > max2_) max2_ = f2;
  if (!calibrated && (millis() - calibStartMs >= CALIBRATION_TIME_MS)){
    baseline1 = 0.5f * (max1_ + min1_);
    baseline2 = 0.5f * (max2_ + min2_);
    float amp1 = 0.5f * (max1_ - min1_);
    float amp2 = 0.5f * (max2_ - min2_);
    if (amp1 < 1.0f) amp1 = 1.0f; // avoid huge gain
    if (amp2 < 1.0f) amp2 = 1.0f;
    gain1 = REF_MV / amp1;
    gain2 = REF_MV / amp2;
    calibrated = true;
  }
}

static inline void emitJson(float lead1_mv, float lead2_mv){
  float lead3_mv = lead2_mv - lead1_mv;               // Einthoven
  // approximate limb potentials (RA≈0, LA≈Lead I, LL≈Lead II)
  float ra = 0.0f, la = lead1_mv, ll = lead2_mv;
  float avr_mv = ra - 0.5f * (la + ll);
  float avl_mv = la - 0.5f * (ra + ll);
  float avf_mv = ll - 0.5f * (ra + la);

  Serial.print('{');
  Serial.print("\"lead1\":"); Serial.print(lead1_mv, 3); Serial.print(',');
  Serial.print("\"lead2\":"); Serial.print(lead2_mv, 3); Serial.print(',');
  Serial.print("\"lead3\":"); Serial.print(lead3_mv, 3); Serial.print(',');
  Serial.print("\"avr\":");   Serial.print(avr_mv, 3);   Serial.print(',');
  Serial.print("\"avl\":");   Serial.print(avl_mv, 3);   Serial.print(',');
  Serial.print("\"avf\":");   Serial.print(avf_mv, 3);
  Serial.println('}');
}

void loop(){
  static unsigned long lastUs = micros();
  const unsigned long intervalUs = (unsigned long)(1000000UL / SAMPLE_RATE_HZ);
  unsigned long now = micros();
  if ((now - lastUs) < intervalUs) return;
  lastUs += intervalUs;

  // Read raw ADC (0..1023)
  float raw1 = (float)analogRead(INPUT_PIN1);
  float raw2 = (float)analogRead(INPUT_PIN2);
  if (INVERT_CH1) raw1 = -raw1;
  if (INVERT_CH2) raw2 = -raw2;

  // Filter each channel with its own state
  float f1 = ECGFilter(0, raw1);
  float f2 = ECGFilter(1, raw2);

  // Update calibration tracking
  updateCalibration(f1, f2);

  // Apply baseline removal + gain after calibration, otherwise pass-through
  float s1 = calibrated ? ( (f1 - baseline1) * gain1 ) : f1;
  float s2 = calibrated ? ( (f2 - baseline2) * gain2 ) : f2;

  // Map to millivolts
  float lead1_mv = s1 * MV_PER_UNIT;
  float lead2_mv = s2 * MV_PER_UNIT;

  // Emit full 6-lead JSON line
  emitJson(lead1_mv, lead2_mv);
}
