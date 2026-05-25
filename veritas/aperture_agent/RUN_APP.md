# How to Run Aperture Agent App

## Basic Commands

### Run on Android Emulator
```bash
cd "/Users/veeshal/MAJOR PROJECT/aperture1/aperture/aperture_agent"
flutter run -d emulator-5554
```

### Run on Chrome (Web)
```bash
flutter run -d chrome
```

### Run on macOS Desktop
```bash
flutter run -d macos
```

### See All Available Devices
```bash
flutter devices
```

## Interactive Commands (While App is Running)

When the app is running in the terminal, you can use these hotkeys:

| Key | Action |
|---|---|
| `r` | **Hot reload** - Reload code changes instantly (preserves app state) |
| `R` | **Hot restart** - Full restart of the app (resets state) |
| `h` | List all available interactive commands |
| `d` | Detach (stop debug session but keep app running) |
| `c` | Clear the screen |
| `q` | Quit (stop the app completely) |

## Common Workflow

1. **First time setup:**
   ```bash
   cd "/Users/veeshal/MAJOR PROJECT/aperture1/aperture/aperture_agent"
   flutter clean
   flutter pub get
   flutter run -d emulator-5554
   ```

2. **Make code changes** in your editor

3. **Press `r`** in the terminal to hot reload

4. **See changes instantly** in the app

5. **Press `q`** when done testing

## Requirements

- ✅ Android Emulator must be running (use Android Studio or `emulator -avd <name>`)
- ✅ Make sure you're in the `aperture_agent` directory
- ✅ Flutter SDK is installed and in PATH

## Troubleshooting

If you get errors:

```bash
flutter clean
flutter pub get
flutter run -d emulator-5554
```

This clears the build cache and dependencies, then rebuilds everything fresh.
