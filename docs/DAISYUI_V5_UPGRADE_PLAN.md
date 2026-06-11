# DaisyUI v5 & Tailwind CSS v4 Upgrade Plan

## Overview

This plan outlines the migration from DaisyUI v4.12.14 to v5 and Tailwind CSS v3.4.16 to v4. DaisyUI v5 requires Tailwind CSS v4, so both must be upgraded together.

## Prerequisites

- Node.js 20 or higher (required for Tailwind CSS v4)
- Current project uses React with Vite
- Current versions: DaisyUI v4.12.14, Tailwind CSS v3.4.16

## Migration Steps

### Phase 1: Preparation

#### 1.1 Backup Current State

```bash
# Create a backup branch
git checkout -b daisyui-v4-backup
git commit -am "Backup before DaisyUI v5 upgrade"
git checkout main
```

#### 1.2 Update Node.js

Ensure Node.js 20+ is installed:

```bash
node --version  # Should be 20.0.0 or higher
```

### Phase 2: Package Updates

#### 2.1 Remove Old Packages

```bash
npm uninstall tailwindcss daisyui autoprefixer postcss
```

#### 2.2 Install New Packages

```bash
# Install Tailwind CSS v4 and DaisyUI v5
npm install tailwindcss@latest @tailwindcss/vite@latest daisyui@latest
```

### Phase 3: Configuration Migration

#### 3.1 Update Vite Configuration

Update `app/vite.config.js`:

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()  // New Tailwind CSS v4 Vite plugin
  ],
  define: {
    __API_URL__: JSON.stringify(process.env.NODE_ENV === 'production' 
      ? 'https://cards.skorbord.app' 
      : 'http://localhost:2525')
  },
  server: {
    port: 2424,
    host: true
  }
})
```

#### 3.2 Remove PostCSS Configuration

Delete `app/postcss.config.js` (no longer needed with Tailwind CSS v4 Vite plugin)

#### 3.3 Update CSS File

Replace content of `app/src/index.css`:

**Before (Tailwind CSS v3):**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom styles */
```

**After (Tailwind CSS v4 + DaisyUI v5):**

```css
@import "tailwindcss";
@plugin "daisyui" {
  themes: light --default, dark --prefersdark;
}

/* Custom styles remain the same */
```

#### 3.4 Remove Tailwind Configuration

Delete `app/tailwind.config.js` - configuration now moves to CSS

### Phase 4: Code Changes

#### 4.1 No Breaking Component Changes

According to the documentation, most DaisyUI component classes remain the same between v4 and v5. The `badge-soft` class that was having issues should work properly in v5.

#### 4.2 Update Any Custom Theme Variables (if used)

If using custom CSS variables, update the naming:

```css
/* Old v4 variables */
/* --p: primary color */

/* New v5 variables */
/* --color-primary: primary color */
```

### Phase 5: Testing & Validation

#### 5.1 Start Development Server

```bash
cd app
npm run dev
```

#### 5.2 Test Key Components

- [ ] Badge components (especially `badge-soft badge-info`)
- [ ] Card components
- [ ] Button components
- [ ] Stats components
- [ ] Timeline components
- [ ] Player color utilities

#### 5.3 Check Responsive Design

- [ ] Mobile view (touch targets)
- [ ] Tablet view
- [ ] Desktop view

### Phase 6: Specific Issues to Address

#### 6.1 Badge Rendering Issue

The `badge-soft` class that wasn't rendering properly should be fixed in v5. Test specifically:

```jsx
// This should now work properly
<span className="badge badge-soft badge-info">
  {gt.name}
</span>
```

#### 6.2 Player Color Classes

Verify the safelist classes are still working:

```css
/* These should be preserved in the new system */
.text-primary
.text-secondary
.text-accent
.text-info
.text-success
.text-warning
.text-error
.badge-soft
.badge-outline
```

### Phase 7: Production Build Testing

#### 7.1 Test Build Process

```bash
cd app
npm run build
npm run preview
```

#### 7.2 Verify CSS Output

Check that all DaisyUI components are included in the final build and no classes are missing.

### Phase 8: Deployment Considerations

#### 8.1 Update CI/CD Scripts

Ensure deployment scripts account for the new build process:

```bash
# In deployment/deploy-cards-app.sh
cd app
npm install  # Will install new versions
npm run build
```

#### 8.2 Update Documentation

Update any references to Tailwind CSS v3 or DaisyUI v4 in documentation.

## Rollback Plan

If issues occur during upgrade:

1. **Quick Rollback:**

   ```bash
   git checkout daisyui-v4-backup
   ```

2. **Selective Rollback:**

   ```bash
   # Reinstall old versions
   npm install tailwindcss@3.4.16 daisyui@4.12.14 autoprefixer@latest postcss@latest
   # Restore old config files from git
   git checkout HEAD~1 -- app/tailwind.config.js app/postcss.config.js app/vite.config.js app/src/index.css
   ```

## Benefits of Upgrade

1. **Performance Improvements:** Tailwind CSS v4 and DaisyUI v5 offer better performance
2. **Better CSS Variables:** Improved theme system with CSS variables
3. **Bug Fixes:** The `badge-soft` rendering issue should be resolved
4. **Future-Proofing:** Stay current with latest features and security updates
5. **Simplified Configuration:** Less configuration files to maintain

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking changes | High | Thorough testing, backup branch |
| Build failures | High | Keep old package-lock.json as backup |
| Component styling issues | Medium | Manual testing of all components |
| Theme color changes | Low | Verify color utilities still work |

## Timeline

- **Preparation:** 1 hour
- **Package updates:** 30 minutes  
- **Configuration migration:** 1 hour
- **Testing:** 2-3 hours
- **Documentation updates:** 30 minutes

**Total estimated time:** 5-6 hours

## Success Criteria

- [ ] All components render correctly
- [ ] `badge-soft` class works properly
- [ ] Player colors display correctly
- [ ] Responsive design maintained
- [ ] Build process completes successfully
- [ ] Production deployment works
- [ ] Performance is equal or better than before

## Post-Upgrade Tasks

1. Update project README with new versions
2. Update development setup documentation  
3. Inform team of any workflow changes
4. Monitor for any edge cases in production
5. Consider leveraging new v5 features in future development

## References

- [DaisyUI v5 Documentation](https://daisyui.com/docs/v5/)
- [Tailwind CSS v4 Upgrade Guide](https://tailwindcss.com/docs/upgrade-guide)
- [DaisyUI Breaking Changes](https://daisyui.com/docs/upgrade/)
