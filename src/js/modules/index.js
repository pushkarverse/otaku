export function launchApp(url, event) {
  // Ripple Effect
  const side = event.currentTarget;
  const circle = document.createElement('div');
  const diameter = Math.max(side.clientWidth, side.clientHeight);
  const radius = diameter / 2;

  circle.style.width = circle.style.height = `${diameter}px`;
  circle.style.left = `${event.clientX - side.getBoundingClientRect().left - radius}px`;
  circle.style.top = `${event.clientY - side.getBoundingClientRect().top - radius}px`;
  circle.classList.add('ripple');

  // Remove existing ripples to keep DOM clean
  const existingRipple = side.querySelector('.ripple');
  if (existingRipple) existingRipple.remove();

  side.appendChild(circle);

  // Trigger Fade Out
  let targetColor;
  if (url === 'naruto.html') targetColor = '#ff3300';
  else if (url === 'gojo.html') targetColor = '#bb44ff';
  else if (url === 'draw.html') targetColor = '#00ff44';
  else if (url === 'dbz.html') targetColor = '#ff9900';
  
  const fadeOverlay = document.getElementById('fade-overlay');
  fadeOverlay.style.background = `radial-gradient(circle at center, ${targetColor} 0%, black 100%)`;

  setTimeout(() => {
    fadeOverlay.classList.add('active');
  }, 100);

  // Navigate after animation
  setTimeout(() => {
    window.location.href = url;
  }, 900);
}

// Expose to window for inline onclick handlers (or better, use event listeners)
window.launchApp = launchApp;
