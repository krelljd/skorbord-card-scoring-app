# Implementation Checklist for Skorbord Modernization

## Quick Reference for LLM Sessions

### Phase 2: Component Modernization (Current Priority)

#### GamePlay.jsx Modernization
- [ ] Create `src/components/modern/GamePlay.jsx`
- [ ] Replace useState with useGameManager hook
- [ ] Remove inline fetch calls, use gameAPI service
- [ ] Add proper error handling with toast notifications
- [ ] Replace custom CSS with DaisyUI semantic classes
- [ ] Test with `?modern=true` flag
- [ ] Update imports once verified working

#### PlayerCard.jsx Update
- [ ] Complete modern implementation in `src/components/modern/PlayerCard.jsx`
- [ ] Use DaisyUI semantic colors (primary, secondary, accent, neutral)
- [ ] Integrate with useGameManager for state updates
- [ ] Add accessibility features (ARIA labels, keyboard support)
- [ ] Test touch interactions on mobile devices

#### GameSetup.jsx Modernization
- [ ] Create modern form using useForm hook
- [ ] Replace inline styles with DaisyUI form classes
- [ ] Add proper validation and error states
- [ ] Use LoadingButton for async operations
- [ ] Implement proper accessibility

### Phase 3: CSS Modernization

#### DaisyUI Migration
- [ ] Audit `src/index.css` for custom styles (800+ lines)
- [ ] Map custom player colors to DaisyUI semantic system
- [ ] Replace animations with DaisyUI utilities
- [ ] Update `src/utils/playerColors.js`
- [ ] Create `src/styles/modern.css`

#### Tailwind Configuration
- [ ] Migrate to `tailwind.modern.config.js`
- [ ] Configure semantic color system
- [ ] Add mobile-first responsive breakpoints
- [ ] Optimize for touch interactions

### Phase 4: Testing & Quality

#### Component Testing
- [ ] Install testing dependencies
- [ ] Create test utilities for context providers
- [ ] Add unit tests for hooks and components
- [ ] Add integration tests for user flows
- [ ] Set up CI/CD pipeline

#### Performance Optimization
- [ ] Add React.memo() to expensive components
- [ ] Implement proper memoization patterns
- [ ] Add code splitting for admin/stats views
- [ ] Optimize bundle size with tree-shaking

### Phase 5: Final Migration

#### Component Replacement
- [ ] Replace GamePlay.jsx with modern version
- [ ] Replace PlayerCard.jsx with modern version
- [ ] Update all remaining components
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
│       ├── PlayerCard.jsx (partial) ⚠️
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
