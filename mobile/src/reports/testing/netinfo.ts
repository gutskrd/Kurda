/**
 * @react-native-community/netinfo for component tests: always online, and a
 * listener that is told so once. `AsyncBoundary` reads it to tell "offline"
 * from "the server said no".
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
