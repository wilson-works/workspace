import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Gallery from './components/Gallery.jsx';
import './office.css';

// #/avatars is a page of its own (the avatar gallery); every other address is the office.
const isGallery = () => window.location.hash === '#/avatars';

function Root() {
  const [gallery, setGallery] = useState(isGallery);
  useEffect(() => {
    const on = () => setGallery(isGallery());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return gallery ? <Gallery /> : <App />;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
