import { registerRootComponent } from 'expo';
import App from './App';
import { installCrashReporting } from './src/errors/crashReporting';

// before the first render, so an error in the first frame is reported like any other
installCrashReporting();
registerRootComponent(App);
