export const state = {
  authUser: null,
  profile: null,
  orders: [],
  availableOrders: [],
  deliveryOrders: [],
  deliveryProfiles: {},
  userProfiles: {},
  activePanel: "landing",
  activeChatOrderId: null,
  authReady: false,
  listeners: [],
  messageListener: null,
  unreadChatOrderIds: []
};

export function clearRealtimeListeners() {
  state.listeners.forEach((unsubscribe) => unsubscribe && unsubscribe());
  state.listeners = [];
  clearMessageListener();
}

export function clearMessageListener() {
  if (state.messageListener) {
    state.messageListener();
    state.messageListener = null;
  }
}

