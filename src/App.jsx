import './App.css'
import ECGVisualizer from './components/ECGVisualizer'

export default function App(){
  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="logo-section">
            <div className="heartbeat-icon">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path className="heartbeat-line" d="M2 20 L10 20 L13 8 L17 32 L21 12 L25 28 L29 20 L38 20" 
                  stroke="#00d9ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </div>
            <div className="brand-text">
              <h1 className="brand-title">
                <span className="brand-next">NEXT</span><span className="brand-ecg">ECG</span>
              </h1>
              <p className="brand-subtitle">Professional 6-Lead Cardiac Monitor</p>
            </div>
          </div>
          <p className="header-info">Real-time visualization • Web Serial (Chrome/Edge) • Clinical-grade accuracy</p>
        </div>
      </header>
      <main>
        <ECGVisualizer />
      </main>
    </div>
  )
}

