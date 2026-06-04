# macOS installer resources

The JavaScript installer build stages macOS resources into `build/macos-resources`.

- A welcome/introduction step is included via `welcome.html`; no readme tab is included.
- `installer/windows/assets/CorsairLogo.bmp` is converted to light and dark sidebar logo PNGs.
- The sidebar logo is black in light mode and white in dark mode, with reduced transparent left padding; no side image is staged.
- `installer/windows/assets/corsair-cli.ico` is converted to `.icns` and used for the installer header/package icon.
