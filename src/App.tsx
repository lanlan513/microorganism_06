import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { ParticleBackground } from './components/ParticleBackground';
import { HomePage } from './pages/HomePage';
import { CategoryPage } from './pages/CategoryPage';
import { DetailPage } from './pages/DetailPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { TimelinePage } from './timeline/TimelinePage';

function Shell() {
  const { pathname } = useLocation();

  // 时间走廊是全屏沉浸视图：无大厅导航 / 页脚 / 粒子背景
  if (pathname === '/timeline') {
    return (
      <Routes>
        <Route path="/timeline" element={<TimelinePage />} />
      </Routes>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col">
      <ParticleBackground />
      <Navbar />
      <main className="relative z-10 flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/category/:category" element={<CategoryPage />} />
          <Route path="/microbe/:id" element={<DetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Shell />
    </Router>
  );
}
