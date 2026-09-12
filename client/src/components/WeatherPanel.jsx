export default function WeatherPanel({ wind }) {
  return (
    <section className="panel weather-panel" aria-labelledby="weather-title">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">第 {String(wind.directionIndex + 1).padStart(2, '0')} 号风图</p>
          <h2 id="weather-title">高空风况</h2>
        </div>
        <span className="weather-level">{wind.strength >= 17 ? '强风' : wind.strength >= 11 ? '中强风' : '平稳'}</span>
      </div>

      <div className="weather-content">
        <div className="wind-compass" aria-label={`${wind.direction}，风速 ${wind.strength} 公里每小时`}>
          <span className="compass-north">N</span>
          <span className="compass-east">E</span>
          <span className="compass-south">S</span>
          <span className="compass-west">W</span>
          <i className="wind-arrow" style={{ transform: `rotate(${wind.angle}deg)` }}>➤</i>
          <b>{wind.strength}</b>
          <small>km/h</small>
        </div>
        <div className="weather-copy">
          <strong>{wind.direction}</strong>
          <p>{wind.note}</p>
          <span>顺风加成随航向变化，逆风会显著拖慢长途航线。</span>
        </div>
      </div>
    </section>
  );
}
