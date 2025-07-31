# Implementation Checklist for Skorbord Modernization

## Quick Reference for LLM Sessions

### Phase 2: Component Modernization (Current Priority)

#### GamePlay.jsx Modernization
- [x] Create `src/components/modern/GamePlay.jsx`
- [x] Replace useState with useGameManager hook
- [x] Remove inline fetch calls, use gameAPI service
- [x] Add proper error handling with toast notifications
- [x] Replace custom CSS with DaisyUI semantic classes
- [x] Test with `?modern=true` flag (Fixed infinite loop issue)
- [x] Fix ModernCardApp to avoid unnecessary useGameManager calls
- [x] Fix gameManager reference errors in ModernCardApp
- [ ] Update imports once verified working

#### PlayerCard.jsx Update
- [x] Complete modern implementation in `src/components/modern/PlayerCard.jsx`
- [x] Use DaisyUI semantic colors (primary, secondary, accent, neutral)
- [x] Integrate with useGameManager for state updates
- [x] Add accessibility features (ARIA labels, keyboard support)
- [x] Add defensive programming for undefined props
- [ ] Test touch interactions on mobile devices

#### GameSetup.jsx Modernization
- [x] Create modern form using useForm hook
- [x] Replace inline styles with DaisyUI form classes
- [x] Add proper validation and error states
- [x] Use LoadingButton for async operations
- [x] Implement proper accessibility
- [x] Remove unnecessary useGameManager call (Fixed HTTP 429 issue)

### Phase 3: CSS Modernization ✅ Complete

#### DaisyUI Migration

- [x] Audit `src/index.css` for custom styles (464 lines)
- [x] Map custom player colors to DaisyUI semantic system
- [x] Replace animations with DaisyUI utilities
- [x] Update `src/utils/playerColors.js`
- [x] Create `src/styles/modern.css`

#### Tailwind Configuration

- [x] Migrate to `tailwind.modern.config.js`
- [x] Configure semantic color system
- [x] Add mobile-first responsive breakpoints
- [x] Optimize for touch interactions

### Phase 4: Quality ✅ Complete

#### Performance Optimization

- [x] Add React.memo() to expensive components (PlayerCard, GamePlay)
- [x] Implement proper memoization patterns (useCallback, useMemo)
- [x] Add code splitting for admin/stats views (LazyComponents.jsx)
- [x] Optimize bundle size with tree-shaking (vite.config.js)

### Phase 5: Final Migration 🚧 In Progress

#### Component Replacement

- [x] Replace ModernCardApp.jsx with modern architecture
- [x] Implement modern GameStateProvider context
- [x] Add ErrorBoundary and Toast systems
- [x] Create LazyComponents for code splitting
- [ ] Complete remaining component modernization
- [ ] Remove legacy code and patterns
- [ ] Clean up development flags

## Current Status: Phase 1 ✅ Complete

### Available Modern Infrastructure
- ✅ GameStateContext with useReducer
- ✅ useGameManager hook for game operations
- ✅ useUIState hooks (toast, loading, forms, modals)
- ✅ gameAPI service with error handling
- ✅ ErrorBoundary component
- ✅ Toast notification system
- ✅ Loading components and states
- ✅ ModernCardApp demo component

### How to Test Modern Features
Visit: `http://localhost:2424/cards/demo?modern=true`

### File Locations for Reference
```
app/src/
├── contexts/
│   ├── GameStateContext.jsx ✅
│   └── ConnectionContext.jsx (existing)
├── hooks/
│   ├── useGameManager.js ✅
│   └── useUIState.js ✅
├── services/
│   ├── gameAPI.js ✅
│   └── socketService.js ✅
├── utils/
│   └── errorUtils.js ✅
├── components/
│   ├── ErrorBoundary.jsx ✅
│   ├── Toast.jsx ✅
│   ├── Loading.jsx ✅
│   ├── ModernCardApp.jsx ✅
│   └── modern/
│       ├── GamePlay.jsx ✅
│       ├── PlayerCard.jsx ✅
│       ├── GameSetup.jsx ✅
│       └── GameLayout.jsx ✅
```

## Next Session Priority

**Start with GamePlay.jsx modernization** - highest impact component:

1. Create `src/components/modern/GamePlay.jsx`
2. Replace complex useState pattern with useGameManager
3. Remove inline API calls, use gameAPI service
4. Add proper error handling and loading states
5. Test thoroughly before replacing legacy component

This provides the biggest impact and demonstrates the modern patterns for other components to follow.
