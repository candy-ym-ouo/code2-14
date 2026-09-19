function routePoints(route, islandMap) {
  const hub = islandMap.get('skyport');
  const points = [`${hub.position.x},${hub.position.y}`];
  for (const letter of route.letters) {
    const island = islandMap.get(letter.targetIslandId);
    if (island) points.push(`${island.position.x},${island.position.y}`);
  }
  return points.join(' ');
}

export default function MapPanel({ game, preview }) {
  const islandMap = new Map(game.islands.map((island) => [island.id, island]));
  const hub = islandMap.get('skyport');
  const openLetters = game.letters.filter((letter) => ['inbox', 'backlog'].includes(letter.status));
  const controlledIslandIds = new Set(
    (game.restrictions || [])
      .filter((rule) => rule.status === 'active')
      .map((rule) => rule.islandId)
  );
  const restrictedRouteIslandIds = new Set();
  for (const route of preview?.routes || []) {
    for (const letter of route.letters || []) {
      if (letter.restricted) restrictedRouteIslandIds.add(letter.targetIslandId);
    }
  }

  return (
    <section className="panel map-panel" aria-labelledby="map-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">实时航线图</p>
          <h2 id="map-title">群岛邮路</h2>
        </div>
        <span className="map-status"><i /> {openLetters.length} 封待处理</span>
      </div>

      <div className="map-canvas">
        <svg viewBox="0 0 100 100" role="img" aria-label="浮空岛与今日信使路线">
          <defs>
            <radialGradient id="islandGlow">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
            <filter id="softGlow">
              <feGaussianBlur stdDeviation="1.2" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <g className="map-grid">
            <path d="M0 20H100 M0 40H100 M0 60H100 M0 80H100" />
            <path d="M20 0V100 M40 0V100 M60 0V100 M80 0V100" />
          </g>

          {preview?.routes?.map((route) => (
            <polyline
              key={route.courierId}
              className="route-line"
              points={routePoints(route, islandMap)}
              style={{ '--route-color': route.color }}
            />
          ))}

          {game.islands.map((island) => {
            const isHub = island.id === 'skyport';
            const controlled = controlledIslandIds.has(island.id);
            const routeBlocked = restrictedRouteIslandIds.has(island.id);
            return (
              <g
                key={island.id}
                className={`map-island ${isHub ? 'is-hub' : ''} ${controlled ? 'is-controlled' : ''} ${routeBlocked ? 'is-route-blocked' : ''}`}
                transform={`translate(${island.position.x} ${island.position.y})`}
              >
                <circle className="island-halo" r={isHub ? 10 : 8} fill="url(#islandGlow)" />
                <circle className="island-body" r={isHub ? 6 : 5} fill={island.color} filter="url(#softGlow)" />
                <circle className="island-core" r={isHub ? 2.2 : 1.7} />
                {controlled && (
                  <g className="control-mark">
                    <circle className="control-ring" r={6.6} />
                    <text className="control-glyph" y={1.6}>⛔</text>
                  </g>
                )}
                <text y={isHub ? -8.5 : -7.5} textAnchor="middle">{island.name}</text>
                {!isHub && <text className="island-code" y="10" textAnchor="middle">{island.code}</text>}
              </g>
            );
          })}
        </svg>

        <div className="map-legend">
          <span><i className="legend-dot" style={{ background: hub?.color }} /> 天枢邮港</span>
          <span><i className="legend-line" /> 今日路线</span>
          <span><i className="legend-control">⛔</i> 临时管制</span>
        </div>
      </div>
    </section>
  );
}
