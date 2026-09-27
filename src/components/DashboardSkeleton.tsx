import type {CSSProperties} from 'react';

function Block({className='',style}:{className?:string;style?:CSSProperties}) {
  return <span className={`skeleton-block ${className}`} style={style} aria-hidden="true"/>;
}

export default function DashboardSkeleton() {
  return <div className="shell skeleton-shell" role="status" aria-label="Restoring your secure session">
    <aside className="sidebar skeleton-sidebar" aria-hidden="true">
      <div className="brand"><div className="brand-mark">S<span>·</span>R</div><div><b>SLK RAVE</b><small>FINANCIAL COMMAND</small></div></div>
      <div className="event-switch"><Block className="sk-event-icon"/><div><Block className="sk-line sk-event-title"/><Block className="sk-line sk-event-subtitle"/></div></div>
      <section className="navgroup"><label>WORKSPACE</label>{[1,2,3,4,5].map(item=><div className="sk-nav" key={item}><Block className="sk-nav-icon"/><Block className="sk-line sk-nav-label"/></div>)}</section>
      <section className="navgroup"><label>MANAGE</label>{[1,2,3].map(item=><div className="sk-nav" key={item}><Block className="sk-nav-icon"/><Block className="sk-line sk-nav-label"/></div>)}</section>
      <div className="sidebar-bottom"><Block className="sk-live"/><div className="profile"><Block className="sk-avatar"/><div className="profile-text"><Block className="sk-line sk-profile-name"/><Block className="sk-line sk-profile-role"/></div></div></div>
    </aside>
    <main className="main skeleton-main" aria-hidden="true">
      <header className="topbar"><div className="crumb">SLK Rave <span>/</span> <b>Overview</b></div><div className="top-actions"><Block className="sk-date"/><Block className="sk-avatar sk-top-avatar"/></div></header>
      <div className="page-wrap">
        <div className="page-heading"><div><Block className="sk-line sk-eyebrow"/><Block className="sk-line sk-page-title"/><Block className="sk-line sk-page-subtitle"/></div><Block className="sk-action"/></div>
        <div className="kpi-grid skeleton-kpis">{[1,2,3,4].map(item=><section className="panel skeleton-kpi" key={item}><div className="sk-kpi-head"><Block className="sk-line sk-kpi-label"/><Block className="sk-avatar sk-kpi-icon"/></div><Block className="sk-line sk-kpi-value"/><Block className="sk-line sk-kpi-caption"/></section>)}</div>
        <div className="grid-main skeleton-grid-main"><section className="panel skeleton-chart-panel"><div className="panel-head"><div><Block className="sk-line sk-section-title"/><Block className="sk-line sk-section-subtitle"/></div><Block className="sk-action sk-select"/></div><div className="sk-chart-area"><div className="sk-chart-grid"/><div className="sk-chart-bars">{[42,68,52,82,61,90,72,55,77,63,88,48].map((height,index)=><Block className="sk-chart-bar" style={{height:`${height}%`}} key={index}/>)}</div></div></section>
          <section className="panel skeleton-budget-panel"><div className="panel-head"><div><Block className="sk-line sk-section-title"/><Block className="sk-line sk-section-subtitle"/></div><Block className="sk-action sk-select"/></div><div className="sk-donut-wrap"><Block className="sk-donut"/></div><Block className="sk-line sk-budget-row"/><Block className="sk-line sk-budget-row short"/><Block className="sk-line sk-budget-progress"/></section>
        </div>
        <div className="grid-lower skeleton-grid-lower"><section className="panel"><div className="panel-head"><div><Block className="sk-line sk-section-title"/><Block className="sk-line sk-section-subtitle"/></div></div><div className="sk-distribution"><Block className="sk-donut sk-small-donut"/><div className="sk-legend">{[1,2,3,4].map(item=><Block className="sk-line sk-legend-row" key={item}/>)}</div></div></section><section className="panel"><div className="panel-head"><div><Block className="sk-line sk-section-title"/><Block className="sk-line sk-section-subtitle"/></div></div>{[1,2,3,4].map(item=><div className="sk-activity-row" key={item}><Block className="sk-avatar sk-activity-icon"/><div><Block className="sk-line sk-activity-title"/><Block className="sk-line sk-activity-subtitle"/></div><Block className="sk-line sk-activity-value"/></div>)}</section></div>
        <section className="panel skeleton-ticket-panel"><div className="panel-head"><div><Block className="sk-line sk-section-title"/><Block className="sk-line sk-section-subtitle"/></div></div>{[1,2,3].map(item=><div className="sk-ticket-row" key={item}><Block className="sk-line sk-ticket-name"/><Block className="sk-line sk-ticket-progress"/><Block className="sk-line sk-ticket-value"/></div>)}</section>
      </div>
    </main>
    <span className="sr-only">Restoring your secure session…</span>
  </div>;
}
