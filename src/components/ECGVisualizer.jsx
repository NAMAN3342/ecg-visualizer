import React, { useEffect, useRef, useState } from 'react'

export default function ECGVisualizer(){
  // Defaults and constants
  const DEFAULT_SAMPLE_RATE = 125
  const DEFAULT_PAPER_SPEED = 25 // mm/s
  const DEFAULT_MM_PER_MV = 10 // mm per mV
  const DEFAULT_PIXELS_PER_MM = 3
  const DEFAULT_SECONDS = 5
  const CAPTURE_SECONDS = 10 // automatic report duration (seconds)
  const ADC_MAX = 1023
  const VREF = 5.0

  const [connected, setConnected] = useState(false)
  const [gain, setGain] = useState(1.0)
  const [sampleRate, setSampleRate] = useState(DEFAULT_SAMPLE_RATE)
  const [isCalibrating, setIsCalibrating] = useState(false)
  const [pixelsPerMm, setPixelsPerMm] = useState(DEFAULT_PIXELS_PER_MM)
  const [secondsWindow, setSecondsWindow] = useState(DEFAULT_SECONDS)
  const [inputUnits, setInputUnits] = useState('mv') // 'mv' | 'adc'

  // Final Report Recording (10 seconds)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingProgress, setRecordingProgress] = useState(0)
  const [showReport, setShowReport] = useState(false)
  const [recordedData, setRecordedData] = useState(null)
  const reportCanvasRef = useRef(null)

  const leads = ['Lead I','Lead II','Lead III','aVR','aVL','aVF']
  // Paired layout: [Lead I, aVL], [Lead II, aVF], [Lead III, aVR]
  const leadPairs = [
    [0, 4], // Lead I (idx 0) + aVL (idx 4)
    [1, 5], // Lead II (idx 1) + aVF (idx 5)
    [2, 3]  // Lead III (idx 2) + aVR (idx 3)
  ]

  // Refs
  const portRef = useRef(null)
  const readerRef = useRef(null)
  const bufferRef = useRef([]) // Float32Array per lead
  const writeIndexRef = useRef(0)
  const runningRef = useRef(false)
  const pairCanvasRefs = useRef([]) // 3 canvases for 3 rows of paired leads

  // (re)initialize buffers when secondsWindow changes
  useEffect(()=>{
    const samples = Math.max(1, Math.floor(sampleRate * secondsWindow))
    bufferRef.current = leads.map(()=>new Float32Array(samples))
    writeIndexRef.current = 0
  },[secondsWindow, sampleRate])

  // Size helper to keep canvas attributes in sync with settings
  function sizeAllCanvases(){
    const samples = bufferRef.current[0]?.length || Math.max(1, Math.floor(sampleRate * secondsWindow))
    const mmPerSample = DEFAULT_PAPER_SPEED / sampleRate
    const width = Math.max(800, Math.floor(samples * pixelsPerMm * mmPerSample))
    for (let i=0; i<leadPairs.length; i++){
      const el = pairCanvasRefs.current[i]
      if(!el) continue
      el.width = width
      el.height = 100 // Height for one row with 2 leads side by side
    }
  }

  // Ensure canvas dimensions track settings
  useEffect(()=>{ sizeAllCanvases() },[pixelsPerMm, secondsWindow])

  // Convert incoming value to mV (heuristic)
  function valueToMv(v){
    if (typeof v !== 'number' || isNaN(v)) return 0
    if (inputUnits === 'adc'){
      // Treat v as raw ADC counts (0..1023) and convert to mV using VREF
      const volts = (v * VREF) / ADC_MAX
      return volts * 1000
    }
    // inputUnits === 'mv': already in millivolts
    return v
  }

  function drawGrid(ctx, width, height, pixelsPerMm){
    // Dark theme grid
    ctx.fillStyle = '#0b0f14'
    ctx.fillRect(0,0,width,height)
    const px = pixelsPerMm
    ctx.strokeStyle = 'rgba(148,163,184,0.12)'
    ctx.lineWidth = 0.6
    for(let x=0;x<=width;x+=px){ctx.beginPath();ctx.moveTo(x+0.5,0);ctx.lineTo(x+0.5,height);ctx.stroke()}
    for(let y=0;y<=height;y+=px){ctx.beginPath();ctx.moveTo(0,y+0.5);ctx.lineTo(width,y+0.5);ctx.stroke()}
    ctx.strokeStyle = 'rgba(148,163,184,0.22)'
    ctx.lineWidth = 1.0
    for(let x=0;x<=width;x+=px*5){ctx.beginPath();ctx.moveTo(x+0.5,0);ctx.lineTo(x+0.5,height);ctx.stroke()}
    for(let y=0;y<=height;y+=px*5){ctx.beginPath();ctx.moveTo(0,y+0.5);ctx.lineTo(width,y+0.5);ctx.stroke()}
  }

  function drawAll(){
    const samples = bufferRef.current[0]?.length || 1
    const mmPerSample = DEFAULT_PAPER_SPEED / sampleRate
    const xStep = pixelsPerMm * mmPerSample

    // Draw each row with paired leads side by side
    for(let rowIdx=0; rowIdx<leadPairs.length; rowIdx++){
      const canvas = pairCanvasRefs.current[rowIdx]
      if(!canvas) continue
      const ctx = canvas.getContext('2d')
      const w = canvas.width
      const h = canvas.height

      drawGrid(ctx,w,h,pixelsPerMm)

      const [leftLeadIdx, rightLeadIdx] = leadPairs[rowIdx]
      const halfW = w / 2
      
      // Draw left lead (e.g., Lead I)
      drawLeadTrace(ctx, leftLeadIdx, 0, halfW, h, samples, xStep, leads[leftLeadIdx])
      
      // Draw right lead (e.g., aVL)
      drawLeadTrace(ctx, rightLeadIdx, halfW, halfW, h, samples, xStep, leads[rightLeadIdx])
    }
  }

  function drawLeadTrace(ctx, leadIdx, xOffset, width, height, samples, xStep, leadName){
    const baselineY = Math.floor(height/2)
    
    // midline
    ctx.strokeStyle='rgba(148,163,184,0.12)'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(xOffset, baselineY+0.5)
    ctx.lineTo(xOffset + width, baselineY+0.5)
    ctx.stroke()

    // calibration pulse (1 mV, 200 ms) at left
    const calHeightPx = 10 * pixelsPerMm // 10 mm = 1 mV
    const calWidthPx = 5 * pixelsPerMm   // 5 mm = 0.2 s at 25 mm/s
    const calX = xOffset + 8
    ctx.fillStyle = '#41ff8b'
    ctx.beginPath()
    ctx.moveTo(calX, baselineY)
    ctx.lineTo(calX, baselineY - calHeightPx)
    ctx.lineTo(calX + calWidthPx, baselineY - calHeightPx)
    ctx.lineTo(calX + calWidthPx, baselineY)
    ctx.closePath()
    ctx.fill()

    // Lead label
    ctx.fillStyle = 'rgba(229,231,235,0.9)'
    ctx.font = '12px Inter, system-ui, Arial'
    ctx.fillText(leadName, calX + calWidthPx + 6, 14)

    // waveform
    ctx.lineWidth = 1.6
    ctx.strokeStyle = '#41ff8b'
    ctx.shadowColor = 'rgba(65,255,139,0.25)'
    ctx.shadowBlur = 4
    ctx.beginPath()
    let x = xOffset
    for(let s=0;s<samples;s++){
      const idx = (writeIndexRef.current + s) % samples
      const mv = bufferRef.current[leadIdx][idx] || 0
      const mm = mv * DEFAULT_MM_PER_MV * gain
      const y = baselineY - mm * pixelsPerMm
      if(s===0) ctx.moveTo(x,y)
      else ctx.lineTo(x,y)
      x += xStep
      if (x > xOffset + width + 2) break
    }
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.shadowColor = 'transparent'
  }

  // animation
  useEffect(()=>{
    if(showReport) return // Don't animate when showing report
    let raf = null
    function tick(){ drawAll(); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return ()=>{ if(raf) cancelAnimationFrame(raf) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[pixelsPerMm,secondsWindow,gain,showReport])

  // Draw final report canvas when report is shown
  useEffect(() => {
    if (!showReport || !recordedData || !reportCanvasRef.current) return
    
    const canvas = reportCanvasRef.current
    const ctx = canvas.getContext('2d')
    
    const ppm = 4 // pixels per mm for report (high-res)
    const paperWidth = 297 // A4 landscape mm (traditional ECG sheet)
    const paperHeight = 210
    canvas.width = paperWidth * ppm
    canvas.height = paperHeight * ppm
    
    // Draw traditional WHITE background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    // RED ECG paper grid lines (1mm minor, 5mm major)
    for (let x = 0; x <= canvas.width; x += ppm) {
      const isMajor = (x % (5 * ppm) === 0)
      ctx.strokeStyle = isMajor ? 'rgba(220, 38, 38, 0.6)' : 'rgba(220, 38, 38, 0.25)'
      ctx.lineWidth = isMajor ? 1 : 0.6
      ctx.beginPath()
      ctx.moveTo(x + 0.5, 0)
      ctx.lineTo(x + 0.5, canvas.height)
      ctx.stroke()
    }
    for (let y = 0; y <= canvas.height; y += ppm) {
      const isMajor = (y % (5 * ppm) === 0)
      ctx.strokeStyle = isMajor ? 'rgba(220, 38, 38, 0.6)' : 'rgba(220, 38, 38, 0.25)'
      ctx.lineWidth = isMajor ? 1 : 0.6
      ctx.beginPath()
      ctx.moveTo(0, y + 0.5)
      ctx.lineTo(canvas.width, y + 0.5)
      ctx.stroke()
    }
    
    // Layout: 3 rows of paired leads
    const rowHeight = 60 * ppm  // 60mm per row
    const margin = 10 * ppm
    const headerHeight = 15 * ppm
    
    // Add header info
    ctx.fillStyle = '#0b0f14'
    ctx.font = 'bold 18px Arial, Helvetica, sans-serif'
    ctx.fillText('NextECG — 10 Second Report', margin, margin + 14)
    ctx.font = '12px Arial, Helvetica, sans-serif'
    ctx.fillText(`Sample Rate: ${sampleRate} Hz  |  Speed: 25 mm/s  |  Gain: ${gain.toFixed(1)}x`, margin, margin + 30)

    // Draw calibration pulse marker (1 mV for 200 ms)
    const calX = margin
    const calY = headerHeight + 5
    const calHeightPx = 10 * ppm // 10mm = 1mV
    const calWidthPx = 5 * ppm   // 5mm = 0.2s at 25mm/s
    ctx.strokeStyle = '#0b0f14'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(calX, calY)
    ctx.lineTo(calX, calY + calHeightPx)
    ctx.lineTo(calX + calWidthPx, calY + calHeightPx)
    ctx.lineTo(calX + calWidthPx, calY)
    ctx.stroke()
    ctx.fillStyle = '#0b0f14'
    ctx.font = '10px Arial'
    ctx.fillText('1mV', calX + calWidthPx + 3, calY + 8)

    leadPairs.forEach((pair, rowIdx) => {
      const [leftIdx, rightIdx] = pair
      const yBase = headerHeight + margin + rowIdx * rowHeight + rowHeight / 2
      const halfWidth = (canvas.width - 2 * margin) / 2
      
      // Draw left lead
      drawReportLead(ctx, recordedData[leads[leftIdx]], leads[leftIdx], margin, yBase, halfWidth, ppm)
      
      // Draw right lead  
      drawReportLead(ctx, recordedData[leads[rightIdx]], leads[rightIdx], margin + halfWidth, yBase, halfWidth, ppm)
    })
    
  }, [showReport, recordedData, sampleRate, gain, leads, leadPairs])

  function drawReportLead(ctx, samples, leadName, xStart, yBase, width, ppm) {
    if (!samples || samples.length === 0) return
    
    // Draw lead label
    ctx.fillStyle = '#0b0f14'
    ctx.font = 'bold 14px Arial, Helvetica, sans-serif'
    ctx.fillText(leadName, xStart + 5, yBase - 40)
    
    // Draw baseline
    ctx.strokeStyle = 'rgba(17,24,39,0.25)'
    ctx.lineWidth = 0.6
    ctx.beginPath()
    ctx.moveTo(xStart, yBase + 0.5)
    ctx.lineTo(xStart + width, yBase + 0.5)
    ctx.stroke()
    
    // Draw waveform (BLACK on red paper)
    ctx.strokeStyle = '#0b0f14'
    ctx.lineWidth = 1.2
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.beginPath()
    
    const mmPerSec = 25 // standard ECG paper speed
    const totalSeconds = samples.length / sampleRate
    const totalWidthMm = totalSeconds * mmPerSec
    const availWidthMm = (width / ppm) - 10 // 10mm padding
    const xScale = availWidthMm / totalWidthMm
    
    for (let i = 0; i < samples.length; i++) {
      const xPos = xStart + 5 * ppm + (i / sampleRate) * mmPerSec * ppm * xScale
      const mv = samples[i]
      const yPos = yBase - (mv * DEFAULT_MM_PER_MV * gain * ppm)
      
      if (i === 0) ctx.moveTo(xPos, yPos)
      else ctx.lineTo(xPos, yPos)
    }
    ctx.stroke()
  }

  // connect via Web Serial
  async function connect(){
    if(!('serial' in navigator)) { alert('Use Chrome or Edge with Web Serial enabled'); return }
    try{
      const port = await navigator.serial.requestPort()
      await port.open({ baudRate: 115200 })
      portRef.current = port
      setConnected(true)
      const decoder = new TextDecoderStream()
      port.readable.pipeTo(decoder.writable)
      const reader = decoder.readable.getReader()
      readerRef.current = reader
  runningRef.current = true
  // enter calibration mode on connect; Arduino typically calibrates for ~5s
  setIsCalibrating(true)
  // fallback: turn off calibration after 5s unless device announces completion
  const calibTimeout = setTimeout(()=>{ setIsCalibrating(false) }, 5000)
      let textBuffer = ''

      while(runningRef.current){
        const { value, done } = await reader.read()
        if(done) break
        textBuffer += value
        const lines = textBuffer.split('\n')
        textBuffer = lines.pop() || ''
        for(let line of lines){
          line = line.trim(); if(!line) continue
          // Detect calibration logs from Arduino (case-insensitive)
          const lower = line.toLowerCase()
          if(lower.includes('calibration complete') || lower.includes('calibrated') || lower.includes('calibration done')){
            setIsCalibrating(false)
            clearTimeout(calibTimeout)
            continue
          }
          if(lower.includes('starting') && lower.includes('calibration')){
            setIsCalibrating(true)
            continue
          }
          // Robust parse: accept JSON, 6-value CSV, or 2-value CSV (Lead I, Lead II)
          let arr = null
          let parsedJson = null
          try{ parsedJson = JSON.parse(line) }catch(_e){ parsedJson = null }
          if(parsedJson && typeof parsedJson === 'object'){
            const keys = ['lead1','lead2','lead3','avr','avl','avf']
            if(keys.every(k=>k in parsedJson)){
              arr = keys.map(k=>parseFloat(parsedJson[k]))
            }
          }
          if(!arr){
            const nums = (line.match(/-?\d+(?:\.\d+)?/g) || []).map(v=>parseFloat(v))
            if(nums.length >= 6){
              arr = nums.slice(0,6)
            } else if(nums.length === 2){
              // Build derived leads from Lead I (LA-RA) and Lead II (LL-RA)
              const lead1 = nums[0]
              const lead2 = nums[1]
              const lead3 = lead2 - lead1
              const ra = 0.0, la = lead1, ll = lead2
              const avr = ra - (la + ll)/2
              const avl = la - (ra + ll)/2
              const avf = ll - (ra + la)/2
              arr = [lead1, lead2, lead3, avr, avl, avf]
            }
          }
          if(!arr) continue

          // If we are calibrating, don't write incoming signal samples to the visible buffer.
          // This prevents the frontend from showing unstable signals during the Arduino's auto-cal phase.
          if(isCalibrating){
            continue
          }

          // Recording for final report (auto-capture)
          if (isRecording) {
            const mvs = arr.map(v => valueToMv(v))
            leads.forEach((ln, idx) => {
              recordedData[ln].push(mvs[idx])
            })
            const duration = recordedData['Lead I'].length / sampleRate
            setRecordingProgress(Math.min(duration, CAPTURE_SECONDS))
            if (duration >= CAPTURE_SECONDS) {
              setIsRecording(false)
              setShowReport(true)
            }
          }

          const samples = bufferRef.current[0]?.length || Math.max(1,Math.floor(sampleRate*secondsWindow))
          for(let i=0;i<arr.length;i++){
            const mv = valueToMv(arr[i])
            if(!bufferRef.current[i]) bufferRef.current[i] = new Float32Array(samples)
            bufferRef.current[i][writeIndexRef.current] = mv
          }
          writeIndexRef.current = (writeIndexRef.current + 1) % samples
        }
      }
    }catch(err){ console.error(err); alert('Connection failed: '+err); setConnected(false) }
  }

  async function disconnect(){
    runningRef.current = false
    setConnected(false)
    setIsRecording(false)
    try{
      if(readerRef.current){ await readerRef.current.cancel(); readerRef.current=null }
      if(portRef.current){ await portRef.current.close(); portRef.current=null }
    }catch(e){console.warn(e)}
  }

  function startRecording() {
    if (!portRef.current || !connected) {
      alert('Connect to device first!')
      return
    }
    // pre-allocate buffers for each lead
    const recData = {}
    leads.forEach(ln => { recData[ln] = [] })
    setRecordedData(recData)
    setRecordingProgress(0)
    setIsRecording(true)
    setShowReport(false)
  }

  // Auto-start capture after calibration completes
  useEffect(() => {
    if (connected && !isCalibrating && !isRecording && !showReport) {
      const timer = setTimeout(() => {
        startRecording()
      }, 500) // Small delay to ensure calibration state is stable
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, isCalibrating, isRecording, showReport])

  function downloadReport() {
    if (reportCanvasRef.current) {
      const link = document.createElement('a')
      link.download = 'ecg-report-10sec.png'
      link.href = reportCanvasRef.current.toDataURL()
      link.click()
    }
  }

  // export PNG - paired leads layout
  function exportPNG(){
    const cvsList = pairCanvasRefs.current.filter(Boolean)
    if(!cvsList.length) return
    const totalW = cvsList[0].width
    const totalH = cvsList.reduce((s,c)=>s+c.height,0)
    const out = document.createElement('canvas')
    out.width = totalW; out.height = totalH
    const ctx = out.getContext('2d')
    let y = 0
    for(let c of cvsList){ ctx.drawImage(c,0,y); y += c.height }
    const url = out.toDataURL('image/png')
    const a = document.createElement('a'); a.href = url; a.download = 'ecg_export.png'; a.click()
  }

  return (
    <div>
      {/* Final Report Modal */}
      {showReport && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.95)', zIndex: 9999,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '20px', overflowY: 'auto'
        }}>
          <div style={{ maxWidth: '100%', textAlign: 'center' }}>
            <h2 style={{ color: '#dc2626', marginBottom: '20px', fontSize: '24px', fontWeight: 'bold' }}>
              📄 Final ECG Report (10 seconds)
            </h2>
            <canvas ref={reportCanvasRef} style={{
              maxWidth: '100%', height: 'auto',
              border: '2px solid #dc2626', borderRadius: '4px',
              boxShadow: '0 0 20px rgba(220,38,38,0.3)'
            }} />
            <div style={{ marginTop: '20px', display: 'flex', gap: '15px', justifyContent: 'center' }}>
              <button onClick={downloadReport} className="btn" style={{
                background: '#dc2626', color: '#ffffff', fontWeight: 'bold', padding: '12px 24px'
              }}>
                💾 Download Report
              </button>
              <button onClick={()=>{ setShowReport(false); if(connected && !isCalibrating) startRecording() }} className="btn" style={{ 
                background: '#41ff8b', color: '#0b0f14', fontWeight: 'bold', padding: '12px 24px'
              }}>
                🔁 New 10s Capture
              </button>
              <button onClick={()=>setShowReport(false)} className="btn" style={{ padding: '12px 24px' }}>
                ✕ Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="controls grid-card">
        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
          {!connected ? (
            <button className="btn" onClick={connect}>🔌 Connect Device</button>
          ) : (
            <button className="btn" onClick={disconnect}>⛔ Disconnect</button>
          )}
          
          <label>Gain: <input type="range" min="0.2" max="6" step="0.1" value={gain} onChange={e=>setGain(parseFloat(e.target.value))} /></label>
          <label>Pixels/mm: <input type="range" min="1" max="6" step="0.5" value={pixelsPerMm} onChange={e=>setPixelsPerMm(parseFloat(e.target.value))} /></label>
          <label>Window (s): <input type="number" min="1" max="10" value={secondsWindow} onChange={e=>setSecondsWindow(parseInt(e.target.value)||1)} /></label>
          <label>Sample rate (Hz): <input type="number" min="20" max="1000" step="1" value={sampleRate} onChange={e=>setSampleRate(Math.max(1, parseInt(e.target.value)||DEFAULT_SAMPLE_RATE))} /></label>
          <label>Input Units: 
            <select value={inputUnits} onChange={e=>setInputUnits(e.target.value)}>
              <option value="mv">mV</option>
              <option value="adc">ADC (0-1023)</option>
            </select>
          </label>
          <button className="btn" onClick={exportPNG}>📷 Export PNG</button>
          <div style={{marginLeft:'auto',fontSize:14}}>
            Status: <strong style={{color: isCalibrating ? '#fb923c' : isRecording ? '#ef4444' : (connected ? '#41ff8b' : '#64748b')}}>
              {isCalibrating ? 'Calibrating...' : isRecording ? `⏺ Recording ${recordingProgress.toFixed(1)}s / ${CAPTURE_SECONDS}s` : (connected ? 'Ready' : 'Disconnected')}
            </strong>
          </div>
        </div>
      </div>

      {/* Paired Leads Display */}
      <div>
        {leadPairs.map((pair, rowIdx)=> {
          const [leftIdx, rightIdx] = pair
          return (
            <div key={rowIdx} className="grid-card" style={{marginBottom:8}}>
              <div className="lead-row">
                <div className="lead-title">{leads[leftIdx]} • {leads[rightIdx]}</div>
                <div style={{fontSize:12,color:'#6b7280'}}>10 mm/mV • 25 mm/s</div>
              </div>
              <canvas
                ref={el=>{ pairCanvasRefs.current[rowIdx]=el; if(el) sizeAllCanvases() }}
                style={{width:'100%',height:100,marginTop:8}}
              />
            </div>
          )
        })}
      </div>

      <div className="footer-note">
        Tip: After calibration, 10-second ECG recording starts automatically. Adjust Gain if signal is too small/large.
      </div>
    </div>
  )
}
