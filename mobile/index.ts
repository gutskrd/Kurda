import { registerRootComponent } from 'expo';
import App from './App';
import { installCrashReporting } from './src/errors/crashReporting';
import { registerLetterWidget } from './src/widget/register';

// before the first render, so an error in the first frame is reported like any other
installCrashReporting();
registerRootComponent(App);
// Android may run this code with no screen at all, only to update the home-screen letter widget
registerLetterWidget();
