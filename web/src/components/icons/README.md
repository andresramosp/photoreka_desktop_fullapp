# Icon Components

This project now uses [@vicons](https://www.xicons.org/) for all icons instead of custom SVG components.

## Available Icon Libraries

The following icon libraries are installed and available:

- `@vicons/ionicons5` - Ionicons 5 icons (Primary choice)
- `@vicons/fluent` - Microsoft Fluent UI icons
- `@vicons/material` - Material Design icons
- `@vicons/antd` - Ant Design icons
- `@vicons/carbon` - IBM Carbon icons

## Usage Examples

### Basic Usage

```vue
<template>
  <n-icon>
    <SearchOutline />
  </n-icon>
</template>

<script setup>
import { SearchOutline } from "@vicons/ionicons5";
</script>
```

### With Size and Color

```vue
<template>
  <n-icon size="24" color="#2563eb">
    <SettingsOutline />
  </n-icon>
</template>

<script setup>
import { SettingsOutline } from "@vicons/ionicons5";
</script>
```

### In Menu Options (for sidebar, dropdowns, etc.)

```vue
<script setup>
import { h } from "vue";
import { NIcon } from "naive-ui";
import { GridOutline } from "@vicons/ionicons5";

const menuOptions = [
  {
    label: "Dashboard",
    key: "dashboard",
    icon: () => h(NIcon, null, { default: () => h(GridOutline) }),
  },
];
</script>
```

## Icon Selection Guidelines

1. **Primary Choice**: Use `@vicons/ionicons5` for consistency and reliability
2. **Naming Convention**: Most Ionicons follow the pattern `[Name]Outline` or `[Name]`
   - Outline: Line/stroke icons (recommended for UI)
   - Filled: Solid icons (for emphasis)
3. **Fallback**: If an icon doesn't exist in Ionicons5, use `@vicons/fluent` or `@vicons/material`

## Common Icons Used in Photoreka

### Navigation

- `GridOutline` - Dashboard/home
- `ImageOutline` - Photo Hub
- `FolderOpenOutline` - Collections
- `SearchOutline` - Search
- `BrushOutline` - Canvas
- `ImagesOutline` - Curation
- `AppsOutline` - Grids

### Actions

- `AddOutline` - Add/plus
- `TrashOutline` - Delete/trash
- `CreateOutline` - Edit
- `ShareOutline` - Share
- `DownloadOutline` - Download
- `CloudUploadOutline` - Upload
- `RefreshOutline` - Refresh/reset
- `CloseOutline` - Close/remove
- `SwapHorizontalOutline` - Replace/swap

### Interface

- `SettingsOutline` - Settings
- `HelpCircleOutline` - Help
- `NotificationsOutline` - Notifications
- `CheckmarkCircleOutline` - Success/check
- `WarningOutline` - Warning
- `InformationCircleOutline` - Information
- `BulbOutline` - AI/ideas/generation
- `BookmarkOutline` - Save/bookmark

### User

- `PersonOutline` - User/profile
- `LogOutOutline` - Logout
- `CameraOutline` - Camera/photos

## Migration Notes

Old custom SVG icon components have been removed and replaced with @vicons.
If you need to add new icons, use the @vicons library instead of creating custom SVG components.

Visit [xicons.org](https://www.xicons.org/) to browse and search for available icons.
