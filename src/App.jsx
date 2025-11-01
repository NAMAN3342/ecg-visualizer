import './App.css'
import ECGVisualizer from './components/ECGVisualizer'

export default function App(){
  return (
    <div className="app">
      <header className="header">
        <h1>NextECG — 6‑Lead Monitor</h1>
        <p className="sub">Connect via Web Serial (Chrome/Edge). Set your sampling rate and units to match your device.</p>
      </header>
      <main>
        <ECGVisualizer />
      </main>
    </div>
  )
}
