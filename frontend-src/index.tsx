import { createRoot, type Root } from 'react-dom/client';
import tokenStyles from '@xsec/design-tokens/styles.css';
import componentStyles from '@xsec/ui-react/styles.css';
import styles from './styles.css';
import { SettingsView, WorkspaceView } from './app';
import { PluginTheme, readTheme } from './theme';
import { SettingsController } from './settings';
import { WorkspaceController } from './workspace';
import type { Context } from './core';
import { hostApi, type Host } from './host-api';

export function createController(host: Host) {
  const api = hostApi(host);
  const settings = api.context.kind === 'settings-page' || api.context.settings?.page === 'settings';
  const controller = settings ? new SettingsController(api) : new WorkspaceController(api);
  const stop = () => controller.dispose();
  let root: Root | undefined;
  console.debug('jwt.activate', { surface: settings ? 'settings' : 'workspace' });
  return {
    mount(element: HTMLElement, context = api.context) {
      if (root) throw new Error('JWT 控制器已经挂载');
      const initial = readTheme();
      root = createRoot(element);
      root.render(<><style>{tokenStyles + componentStyles + styles}</style><PluginTheme api={api} initial={initial} onFailure={stop}>
        {settings ? <SettingsView controller={controller as SettingsController}/> : <WorkspaceView controller={controller as WorkspaceController}/>}
      </PluginTheme></>);
      return controller.begin(context);
    },
    update(context: Context = api.context) { return controller.update(context); },
    dispose() { controller.dispose(); root?.unmount(); root = undefined; },
  };
}
