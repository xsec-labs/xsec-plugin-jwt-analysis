import { useLayoutEffect, useState, type ReactNode } from 'react';
import { ControlThemeProvider, ErrorState } from '@xsec/ui-react';
import { themeAttributes, type ThemeSettings } from '@xsec/design-tokens';
import { failure, operation, type Api, type UiError } from './core';
function parseTheme(theme: Record<string, string>): ThemeSettings {
    const mode = theme['color-mode'], density = theme['ui-density'], motion = theme['reduce-motion'], size = theme['ui-font-size'];
    if (mode !== 'light' && mode !== 'dark')
        throw new Error('Host color mode is invalid');
    if (density !== 'compact' && density !== 'comfortable')
        throw new Error('Host UI density is invalid');
    if (motion !== 'true' && motion !== 'false')
        throw new Error('Host reduced motion preference is invalid');
    if (typeof size !== 'string' || !/^\d+(?:\.\d+)?px$/.test(size))
        throw new Error('Host UI font size is invalid');
    const settings: ThemeSettings = { colorMode: mode, density, reducedMotion: motion === 'true', fontScale: Number(size.slice(0, -2)) / 14, locale: 'zh-CN' };
    themeAttributes(settings);
    return settings;
}
export function readTheme() {
    const style = getComputedStyle(document.documentElement);
    return parseTheme(Object.fromEntries(['color-mode', 'ui-density', 'reduce-motion', 'ui-font-size'].map(key => [key, style.getPropertyValue('--xsec-' + key).trim()])));
}
export function PluginTheme({ api, initial, onFailure, children }: {
    api: Api;
    initial: ThemeSettings;
    onFailure: () => void;
    children: ReactNode;
}) {
    const [settings, setSettings] = useState(initial);
    const [error, setError] = useState<UiError>();
    useLayoutEffect(() => {
        let failed = false;
        const subscription = api.onTheme(theme => {
            if (failed) return;
            try { setSettings(parseTheme(theme)); }
            catch (cause) {
                failed = true;
                onFailure();
                setError(failure('jwt.theme.failed', cause, operation()));
            }
        });
        return () => subscription.dispose();
    }, [api, onFailure]);
    return <ControlThemeProvider settings={settings} className="jwt-theme">{error ?
        <div className="jwt-theme-error"><ErrorState title="Host 显示设置无效" description={error.message} errorId={error.operationId}/>
        <p>请修正应用外观设置后重新载入插件。</p></div> : children}</ControlThemeProvider>;
}
