import OverviewTab     from './tabs/OverviewTab'
import SevereTab      from './tabs/SevereTab'
import ObservationsTab from './tabs/ObservationsTab'
import ForecastTab    from './tabs/ForecastTab'

export default function MainContent({ activeTab, location }) {
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
      {activeTab === 'overview'      && <OverviewTab location={location} />}
      {activeTab === 'severe'        && <SevereTab />}
      {activeTab === 'observations'  && <ObservationsTab />}
      {activeTab === 'forecast'      && <ForecastTab location={location} />}
    </main>
  )
}
