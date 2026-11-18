/**
 * @react-native-community/netinfo for component tests: always online, told to a listener once. `AsyncBoundary` reads it
 * to tell "offline" from "the server said no".
 */
type Listener = (state: { isConnected: boolean | null }) => void;

const NetInfo = {
  addEventListener(listener: Listener): () => void {
    listener({ isConnected: true });
    return () => undefined;
  },
  async fetch(): Promise<{ isConnected: boolean }> {
    return { isConnected: true };
  },
};

export default NetInfo;
