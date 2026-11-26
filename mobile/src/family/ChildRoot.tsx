import { useCallback } from 'react';
import { createNativeStackNavigator, type NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { isWordSetId } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { AlphabetScreen } from '../alphabet/AlphabetScreen';
import { BadgesScreen } from '../badges/BadgesScreen';
import { BadgeCelebrationHost } from '../badges/BadgeCelebrationHost';
import { JumpTestScreen } from '../coursemap/JumpTestScreen';
import { BuildSentenceScreen } from '../games/BuildSentenceScreen';
import { HearItScreen } from '../games/HearItScreen';
import { NextLessonScreen } from '../learn/NextLessonScreen';
import { LessonPlayerScreen } from '../lesson/LessonPlayerScreen';
import { ProverbRoundScreen } from '../lore/ProverbRoundScreen';
import { ProverbScreen } from '../lore/ProverbScreen';
import { ProverbsScreen } from '../lore/ProverbsScreen';
import { RiddleAnswerScreen } from '../lore/RiddleAnswerScreen';
import { RiddleScreen } from '../lore/RiddleScreen';
import { RiddlesScreen } from '../lore/RiddlesScreen';
import { leaveLinked } from '../navigation/leaveLinked';
import type { RootStackParamList } from '../navigation/rootStack';
import { settingsPageRouteId } from '../navigation/rootStack';
import { rootRouter } from '../navigation/returnTo';
import { cardOptions, stackOptions } from '../navigation/stackOptions';
import { PracticeHubScreen } from '../practice/PracticeHubScreen';
import { PracticeScreen } from '../practice/PracticeScreen';
import { PushRegistration } from '../push/PushRegistration';
import { RaceScreen } from '../race/RaceScreen';
import { DictionaryScreen } from '../screens/DictionaryScreen';
import { SettingsPageScreen } from '../settings/SettingsPageScreen';
import { StoriesScreen } from '../stories/StoriesScreen';
import { StoryReaderScreen } from '../stories/StoryReaderScreen';
import { Arrive, originOf } from '../theme/origin';
import { useTheme } from '../theme/ThemeProvider';
import { TreeScreen } from '../tree/TreeScreen';
import { WordleScreen } from '../wordle/WordleScreen';
import { WordSetScreen } from '../words/WordSetScreen';
import { WordsScreen } from '../words/WordsScreen';
import { ChildHome } from './ChildHome';
import { ChildProfile } from './ChildProfile';

const ChildStack = createNativeStackNavigator<RootStackParamList>();

/** Back from a screen, only while it is the one in front, as the app's own stack does. */
const backFrom = (navigation: { isFocused(): boolean; goBack(): void }) => (): void => {
  if (navigation.isFocused()) navigation.goBack();
};

/**
 * Child mode: the app as a child's profile has it, which the server holds to the same parts (api family/child-gate.ts).
 * Its home stands where the tabs do, under the same route name, so a lesson's "back to the path" comes home; only the
 * screens a child may use are here, so no social tab, search, notification list or shop can be opened.
 */
export function ChildRoot(): React.JSX.Element {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const card = useCallback(
    ({ route }: { route: { key: string } }): NativeStackNavigationOptions => cardOptions(!reduceMotion && originOf(route.key) !== null),
    [reduceMotion],
  );
  const heldCard = useCallback((args: { route: { key: string } }): NativeStackNavigationOptions => ({ ...card(args), gestureEnabled: false }), [card]);
  const home = (navigation: { popTo: (name: 'Tabs') => void }) => () => navigation.popTo('Tabs');
  return (
    <BadgeCelebrationHost>
      {/* Learning reminders only, and only while the parent allows them (push/PushRegistration.tsx). */}
      <PushRegistration />
      <ChildStack.Navigator
        screenOptions={stackOptions(reduceMotion, colors.background)}
        UNSTABLE_router={rootRouter}
        screenLayout={({ children, route, options }) => (
          <Arrive routeKey={route.key} grows={options.animation === 'fade'}>
            {children}
          </Arrive>
        )}
      >
        <ChildStack.Screen name="Tabs" component={ChildHome} />
        <ChildStack.Screen name="ChildProfile" options={card}>
          {({ navigation }) => <ChildProfile onExit={backFrom(navigation)} />}
        </ChildStack.Screen>
        <ChildStack.Screen name="SettingsPage" options={card} getId={settingsPageRouteId}>
          {({ route, navigation }) => <SettingsPageScreen page={route.params.page} teenId={route.params.teenId} onExit={backFrom(navigation)} />}
        </ChildStack.Screen>
        <ChildStack.Screen name="Lesson" options={{ presentation: 'fullScreenModal' }}>
          {({ route, navigation }) => (
            <LessonPlayerScreen
              lessonId={route.params.lessonId}
              courseId={route.params.courseId}
              onExit={backFrom(navigation)}
              onNext={(lessonId) => navigation.replace('Lesson', { lessonId, courseId: route.params.courseId })}
              onPractise={(exerciseIds) => navigation.replace('Practice', { exerciseIds })}
              onPath={home(navigation)}
            />
          )}
        </ChildStack.Screen>
        <ChildStack.Screen name="NextLesson" options={{ presentation: 'fullScreenModal' }}>
          {({ navigation }) => <NextLessonScreen onLesson={(lessonId, courseId) => navigation.replace('Lesson', { lessonId, courseId })} onLearn={home(navigation)} />}
        </ChildStack.Screen>
        <ChildStack.Screen name="Practice" options={{ presentation: 'fullScreenModal' }}>
          {({ route, navigation }) => (
            <PracticeScreen
              navigation={navigation}
              exerciseIds={route.params?.exerciseIds}
              mode={route.params?.mode}
              unitId={route.params?.unitId}
              sessionId={route.params?.sessionId}
              onExit={backFrom(navigation)}
            />
          )}
        </ChildStack.Screen>
        <ChildStack.Screen name="PracticeHub" options={card}>
          {({ navigation }) => <PracticeHubScreen onExit={backFrom(navigation)} />}
        </ChildStack.Screen>
        <ChildStack.Screen name="JumpTest" options={{ presentation: 'fullScreenModal' }}>
          {({ route, navigation }) => (
            <JumpTestScreen courseId={route.params.courseId} unitId={route.params.unitId} onExit={backFrom(navigation)} onPath={home(navigation)} onAgain={() => navigation.replace('JumpTest', route.params)} />
          )}
        </ChildStack.Screen>
        <ChildStack.Screen name="Stories" options={card}>
          {({ route, navigation }) => <StoriesScreen id={route.params?.id} onExit={backFrom(navigation)} />}
        </ChildStack.Screen>
        <ChildStack.Screen name="StoryReader" options={card}>
          {({ route, navigation }) => <StoryReaderScreen slug={route.params.slug} onExit={backFrom(navigation)} />}
        </ChildStack.Screen>
        <ChildStack.Screen name="Riddles" options={card}>
          {({ route, navigation }) => <RiddlesScreen dialect={route.params?.dialect} onExit={backFrom(navigation)} />}
        </ChildStack.Screen>
        <ChildStack.Screen name="Riddle" options={card} getId={({ params }) => params.slug}>
          {({ route, navigation }) => <RiddleScreen key={route.params.slug} slug={route.params.slug} onExit={() => leaveLinked(navigation, 'Riddles')} />}
        </ChildStack.Screen>
        <ChildStack.Screen name="RiddleAnswer" options={card}>
          {({ route, navigation }) => <RiddleAnswerScreen key={route.params.slug} slug={route.params.slug} onExit={() => leaveLinked(navigation, 'Riddles')} />}
        </ChildStack.Screen>
        <ChildStack.Screen name="Proverbs" options={card}>
          {({ route, navigation }) => <ProverbsScreen dialect={route.params?.dialect} theme={route.params?.theme} onExit={backFrom(navigation)} />}
        </ChildStack.Screen>
        <ChildStack.Screen name="Proverb" options={card} getId={({ params }) => params.slug}>
          {({ route, navigation }) => <ProverbScreen key={route.params.slug} slug={route.params.slug} onExit={() => leaveLinked(navigation, 'Proverbs')} />}
        </ChildStack.Screen>
        <ChildStack.Screen name="ProverbRound" options={heldCard}>
          {({ route, navigation }) => <ProverbRoundScreen dialect={route.params.dialect} mode={route.params.mode} onExit={backFrom(navigation)} />}
        </ChildStack.Screen>
        <ChildStack.Screen name="Alphabet" options={card}>
          {({ route, navigation }) => <AlphabetScreen script={route.params?.script} onExit={backFrom(navigation)} />}
        </ChildStack.Screen>
        <ChildStack.Screen name="Dictionary" options={card}>
          {({ navigation }) => <DictionaryScreen onBack={backFrom(navigation)} />}
        </ChildStack.Screen>
        <ChildStack.Screen name="Words" options={card}>
          {({ navigation }) => <WordsScreen onExit={backFrom(navigation)} />}
        </ChildStack.Screen>
        <ChildStack.Screen name="WordSet" options={card}>
          {({ route, navigation }) =>
            isWordSetId(route.params.set) ? <WordSetScreen set={route.params.set} script={route.params.script} onExit={backFrom(navigation)} /> : <WordsScreen onExit={backFrom(navigation)} />
          }
        </ChildStack.Screen>
        <ChildStack.Screen name="Tree" options={card}>
          {({ navigation }) => <TreeScreen onExit={backFrom(navigation)} />}
        </ChildStack.Screen>
        <ChildStack.Screen name="Badges" options={card}>
          {({ navigation }) => <BadgesScreen onExit={backFrom(navigation)} />}
        </ChildStack.Screen>
        <ChildStack.Screen name="Wordle" options={card}>
          {({ navigation }) => <WordleScreen onExit={backFrom(navigation)} />}
        </ChildStack.Screen>
        <ChildStack.Screen name="Race" options={card}>
          {({ navigation }) => <RaceScreen onExit={backFrom(navigation)} />}
        </ChildStack.Screen>
        <ChildStack.Screen name="BuildSentence" options={card}>
          {({ navigation }) => <BuildSentenceScreen onExit={backFrom(navigation)} />}
        </ChildStack.Screen>
        <ChildStack.Screen name="HearIt" options={card}>
          {({ navigation }) => <HearItScreen onExit={backFrom(navigation)} />}
        </ChildStack.Screen>
      </ChildStack.Navigator>
    </BadgeCelebrationHost>
  );
}
