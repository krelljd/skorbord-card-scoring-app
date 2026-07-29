import { lazy, Suspense } from 'react'

// Lazy load admin components for better bundle splitting
const AdminPanel = lazy(() => import('./AdminPanel.jsx'))
const RivalryStats = lazy(() => import('./RivalryStats.jsx'))
const RivalryAdmin = lazy(() => import('./RivalryAdmin.jsx'))

/**
 * Code-split admin/stats views to reduce main bundle size
 * These components are only loaded when actually needed
 */
export const LazyAdminPanel = (props) => (
  <Suspense fallback={
    <div className="flex items-center justify-center min-h-96">
      <div className="loading loading-spinner loading-lg text-primary"></div>
      <span className="ml-2 text-base-content">Loading admin panel...</span>
    </div>
  }>
    <AdminPanel {...props} />
  </Suspense>
)

export const LazyRivalryStats = (props) => (
  <Suspense fallback={
    <div className="flex items-center justify-center min-h-96">
      <div className="loading loading-spinner loading-lg text-primary"></div>
      <span className="ml-2 text-base-content">Loading stats...</span>
    </div>
  }>
    <RivalryStats {...props} />
  </Suspense>
)

export const LazyRivalryAdmin = (props) => (
  <Suspense fallback={
    <div className="flex items-center justify-center min-h-96">
      <div className="loading loading-spinner loading-lg text-primary"></div>
      <span className="ml-2 text-base-content">Loading rivalry admin...</span>
    </div>
  }>
    <RivalryAdmin {...props} />
  </Suspense>
)

// Export for use in routing
export { AdminPanel, RivalryStats, RivalryAdmin }
