import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Room from './pages/Room';
import TeamSelection from './pages/TeamSelection';
import Summary from './pages/Summary';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-ipl-bg text-white">
        {/* Simple rendering verification */}
        <div className="sr-only">IPL Auction System Active</div>
        
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/room/:roomId" element={<Room />} />
          <Route path="/room/:roomId/select-team" element={<TeamSelection />} />
          <Route path="/room/:roomId/summary" element={<Summary />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
