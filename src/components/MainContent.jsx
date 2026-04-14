import OverviewTab     from './tabs/OverviewTab'
import SevereTab      from './tabs/SevereTab'
import ObservationsTab from './tabs/ObservationsTab'
import ForecastTab    from './tabs/ForecastTab'
import ChaseOpsTab    from './tabs/ChaseOpsTab'
import AboutTab       from './tabs/AboutTab'

export default function MainContent({ activeTab, setActiveTab, location }) {
  return (
    <main
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: '#090b14',
        overflow: 'hidden',
        minHeight: 0,
      }}
    >
      {activeTab === 'overview'      && <OverviewTab location={location} setActiveTab={setActiveTab} />}
      {activeTab === 'severe'        && <SevereTab location={location} />}
      {activeTab === 'observations'  && <ObservationsTab location={location} />}
      {activeTab === 'forecast'      && <ForecastTab location={location} />}
      {activeTab === 'chaseops'      && <ChaseOpsTab location={location} />}
      {activeTab === 'about'         && <AboutTab />}
    </main>
  )
}
