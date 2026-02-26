const canvas = document.createElement('canvas');
canvas.width = 1200;
canvas.height = 800;
const ctx = canvas.getContext('2d');

// Background
ctx.fillStyle = '#0f172a';
ctx.fillRect(0, 0, 1200, 800);

// Grid pattern
ctx.strokeStyle = '#1e293b';
ctx.lineWidth = 1;
for (let x = 0; x < 1200; x += 20) {
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, 800);
  ctx.stroke();
}
for (let y = 0; y < 800; y += 20) {
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(1200, y);
  ctx.stroke();
}

// Title
ctx.fillStyle = '#fff';
ctx.font = 'bold 24px system-ui, sans-serif';
ctx.fillText('🏝️ MAP', 20, 40);
ctx.font = '14px system-ui, sans-serif';
ctx.fillStyle = '#94a3b8';
ctx.fillText('Sasha Architecture - Island View', 20, 65);

// Center - ClawdBot
centerX = 600;
centerY = 400;
centerRadius = 80;

// Glow
const centerGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, centerRadius + 30);
centerGradient.addColorStop(0, 'rgba(99, 102, 241, 0.6)');
centerGradient.addColorStop(1, 'rgba(99, 102, 241, 0)');
ctx.fillStyle = centerGradient;
ctx.beginPath();
ctx.arc(centerX, centerY, centerRadius + 30, 0, Math.PI * 2);
ctx.fill();

// Center circle
const centerBg = ctx.createLinearGradient(centerX - centerRadius, centerY - centerRadius, centerX + centerRadius, centerY + centerRadius);
centerBg.addColorStop(0, '#6366f1');
centerBg.addColorStop(1, '#4f46e5');
ctx.fillStyle = centerBg;
ctx.beginPath();
ctx.arc(centerX, centerY, centerRadius, 0, Math.PI * 2);
ctx.fill();

// Center border
ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)';
ctx.lineWidth = 4;
ctx.beginPath();
ctx.arc(centerX, centerY, centerRadius, 0, Math.PI * 2);
ctx.stroke();

// Center text
ctx.fillStyle = '#fff';
ctx.font = '48px sans-serif';
ctx.textAlign = 'center';
ctx.fillText('🤖', centerX, centerY - 10);
ctx.font = 'bold 18px system-ui, sans-serif';
ctx.fillText('ClawdBot', centerX, centerY + 20);
ctx.font = '12px system-ui, sans-serif';
ctx.fillStyle = 'rgba(255,255,255,0.7)';
ctx.fillText('Sasha', centerX, centerY + 38);

// Badge
ctx.fillStyle = '#1e293b';
ctx.beginPath();
ctx.roundRect(centerX - 35, centerY + 50, 70, 22, 11);
ctx.fill();
ctx.strokeStyle = 'rgba(255,255,255,0.2)';
ctx.lineWidth = 1;
ctx.beginPath();
ctx.roundRect(centerX - 35, centerY + 50, 70, 22, 11);
ctx.stroke();
ctx.fillStyle = '#94a3b8';
ctx.font = '11px system-ui, sans-serif';
ctx.fillText('7 islands', centerX, centerY + 65);

// Islands
const islands = [
  { label: 'Skills &\nAutomations', icon: '🛠️', color: '#10b981', features: 11 },
  { label: 'Discord\nSetup', icon: '💬', color: '#5865F2', features: 8 },
  { label: 'Mission\nControl', icon: '🎮', color: '#f97316', features: 5 },
  { label: 'Dashboards', icon: '📊', color: '#06b6d4', features: 3 },
  { label: 'Memory\nSystems', icon: '🧠', color: '#8b5cf6', features: 8 },
  { label: 'Browser\n& Web', icon: '🌐', color: '#0ea5e9', features: 2 },
  { label: 'Security &\nAccess', icon: '🔒', color: '#eab308', features: 3 },
];

const radius = 350;
const islandRadius = 50;

islands.forEach((island, i) => {
  const angle = (i * (2 * Math.PI) / islands.length) - Math.PI / 2;
  const x = centerX + Math.cos(angle) * radius;
  const y = centerY + Math.sin(angle) * radius;
  
  // Connection line
  ctx.strokeStyle = island.color;
  ctx.lineWidth = 3;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(centerX + Math.cos(angle) * (centerRadius + 5), centerY + Math.sin(angle) * (centerRadius + 5));
  ctx.lineTo(x - Math.cos(angle) * (islandRadius + 5), y - Math.sin(angle) * (islandRadius + 5));
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Glow
  const glow = ctx.createRadialGradient(x, y, 0, x, y, islandRadius + 20);
  glow.addColorStop(0, island.color + '40');
  glow.addColorStop(1, island.color + '00');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, islandRadius + 20, 0, Math.PI * 2);
  ctx.fill();
  
  // Island circle
  ctx.fillStyle = island.color + '30';
  ctx.beginPath();
  ctx.arc(x, y, islandRadius, 0, Math.PI * 2);
  ctx.fill();
  
  // Border
  ctx.strokeStyle = island.color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, islandRadius, 0, Math.PI * 2);
  ctx.stroke();
  
  // Shadow
  ctx.shadowColor = island.color;
  ctx.shadowBlur = 30;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  
  // Icon
  ctx.font = '32px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(island.icon, x, y - 5);
  
  // Label
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px system-ui, sans-serif';
  const lines = island.label.split('\n');
  lines.forEach((line, li) => {
    ctx.fillText(line, x, y + 12 + li * 12);
  });
  
  // Feature count badge
  const badgeX = x + 35;
  const badgeY = y - 35;
  ctx.fillStyle = island.color;
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.fillText(island.features, badgeX, badgeY + 3);
});

// Legend
const legendX = 20;
const legendY = 700;
ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
ctx.beginPath();
ctx.roundRect(legendX, legendY, 140, 90, 8);
ctx.fill();
ctx.strokeStyle = 'rgba(255,255,255,0.1)';
ctx.lineWidth = 1;
ctx.beginPath();
ctx.roundRect(legendX, legendY, 140, 90, 8);
ctx.stroke();

ctx.fillStyle = '#94a3b8';
ctx.font = '11px system-ui, sans-serif';
ctx.textAlign = 'left';
ctx.fillText('LEGEND', legendX + 12, legendY + 20);

const legendItems = [
  { color: '#6366f1', label: 'Core' },
  { color: '#10b981', label: 'Active' },
  { color: '#eab308', label: 'Security' },
];

legendItems.forEach((item, i) => {
  ctx.fillStyle = item.color;
  ctx.beginPath();
  ctx.arc(legendX + 20, legendY + 40 + i * 18, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(item.label, legendX + 35, legendY + 44 + i * 18);
});

// Add Island button
const btnX = 1020;
const btnY = 20;
ctx.fillStyle = 'rgba(6, 182, 212, 0.1)';
ctx.beginPath();
ctx.roundRect(btnX, btnY, 120, 36, 6);
ctx.fill();
ctx.strokeStyle = 'rgba(6, 182, 212, 0.3)';
ctx.lineWidth = 1;
ctx.beginPath();
ctx.roundRect(btnX, btnY, 120, 36, 6);
ctx.stroke();
ctx.fillStyle = '#06b6d4';
ctx.font = '13px system-ui, sans-serif';
ctx.textAlign = 'center';
ctx.fillText('+ Add Island', btnX + 60, btnY + 23);

// Return canvas data
return canvas.toDataURL('image/png');
