function relationTone(value) {
  if (value >= 70) return 'friendly';
  if (value >= 45) return 'neutral';
  if (value >= 20) return 'strained';
  return 'hostile';
}

export default function RelationsPanel({ game, relationChanges = [] }) {
  const islandMap = new Map(game.islands.map((island) => [island.id, island]));
  const changes = new Map(relationChanges.map((change) => [change.key, change]));

  return (
    <section className="panel relations-panel" aria-labelledby="relations-title">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">外交电报</p>
          <h2 id="relations-title">岛屿关系</h2>
        </div>
        <span className="relation-average">均值 {game.averageRelation}</span>
      </div>
      <div className="relation-list">
        {Object.entries(game.relations).map(([key, value]) => {
          const [firstId, secondId] = key.split(':');
          const change = changes.get(key);
          const isLimited = change && change.requestedDelta !== undefined && change.requestedDelta !== change.delta;
          return (
            <div className="relation-row" key={key}>
              <div className="relation-label">
                <span>{islandMap.get(firstId)?.name}</span>
                <i>↔</i>
                <span>{islandMap.get(secondId)?.name}</span>
              </div>
              <div className="relation-value">
                <div className="relation-track">
                  <i className={relationTone(value)} style={{ width: `${Math.max(0, value)}%` }} />
                </div>
                <b>{value}</b>
                {change && (
                  <em
                    className={change.delta > 0 ? 'positive' : change.delta < 0 ? 'negative' : ''}
                    title={isLimited ? '关系已到上下限，实际变化量受到限制' : undefined}
                  >
                    {change.delta > 0 ? '+' : ''}{change.delta}{isLimited ? '*' : ''}
                  </em>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
