import { appSettings } from "./firebase-config.js";
import { el, showToast } from "./dom.js";
import { normalizeSnapshot } from "./format.js";
import {
  renderAdminOrders,
  renderAdminUsers,
  renderAvailableOrders,
  renderChatOrders,
  renderClientOrders,
  renderDeliveryRanking,
  renderDashboard,
  renderLoadingView,
  renderDeliveryOrders,
  renderMessages,
  selectDeliveryOrderTab,
  renderStores,
  renderSubscriptions
} from "./render.js";
import { bindRouteEvents, defaultPanelForRole, navigate } from "./router.js";
import { clearMessageListener, clearRealtimeListeners, state } from "./state.js";

let services = null;
const AUTH_STARTUP_TIMEOUT_MS = 8000;
const AUTH_TIMEOUT_MESSAGE = "No se pudo verificar la sesión. Revisá tu conexión e intentá iniciar sesión.";
const ADMIN_WHATSAPP = "5493804588261";
let authStartupTimer = null;

const orderHandlers = {
  openChat,
  accept: acceptAvailableOrder,
  mark: markOrder,
  rate: rateCompletedOrder,
  cancel: cancelClientOrder
};

const adminHandlers = {
  ...orderHandlers,
  approve: (uid) => approvePendingDelivery(uid),
  suspend: (user) => suspendUser(user),
  removeSubscription: (subscriptionId) => deleteSubscription(subscriptionId),
  assignSubscription: (delivery, planId) => assignSubscription(delivery, planId),
  renewSubscription: (delivery, planId) => renewSubscription(delivery, planId),
  editStore: (store) => editStore(store),
  removeStore: (store) => deleteStore(store)
};

bindRouteEvents();
bindForms();
renderLoadingView();
startAuthStartupTimeout();
loadFirebaseRuntime();

async function loadFirebaseRuntime() {
  try {
    services = await import("./services.js");
    services.watchAuth(handleAuthChange, handleAuthError);
  } catch (error) {
    console.error("No se pudo iniciar Firebase:", error);
    handleAuthError(error);
  }
}

function startAuthStartupTimeout() {
  clearAuthStartupTimeout();
  authStartupTimer = setTimeout(() => {
    if (state.authReady) return;
    state.authReady = true;
    window.ALTOQUE_AUTH_READY = true;
    navigate("landing");
    showToast(AUTH_TIMEOUT_MESSAGE);
  }, AUTH_STARTUP_TIMEOUT_MS);
}

function clearAuthStartupTimeout() {
  if (!authStartupTimer) return;
  clearTimeout(authStartupTimer);
  authStartupTimer = null;
}

function handleAuthError(error) {
  console.error("Error verificando sesión:", error);
  if (state.authReady) return;
  clearAuthStartupTimeout();
  state.authReady = true;
  window.ALTOQUE_AUTH_READY = true;
  navigate("landing");
  showToast(AUTH_TIMEOUT_MESSAGE);
}

function requireServices() {
  if (services) return true;
  showToast("Firebase todavía no está listo. Revisá la configuración del proyecto.");
  return false;
}

function bindForms() {
  el.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireServices()) return;
    const email = el.loginEmail.value.trim();
    const password = el.loginPassword.value;

    try {
      await services.loginAccount(email, password);
    } catch (error) {
      showToast(error.message);
    }
  });

  if (el.toggleLoginPassword && el.loginPassword) {
    el.toggleLoginPassword.addEventListener("click", () => {
      const shouldShowPassword = el.loginPassword.type === "password";
      el.loginPassword.type = shouldShowPassword ? "text" : "password";
      el.toggleLoginPassword.textContent = shouldShowPassword ? "🙈" : "👁️";
      el.toggleLoginPassword.setAttribute("aria-label", shouldShowPassword ? "Ocultar contraseña" : "Mostrar contraseña");
      el.toggleLoginPassword.setAttribute("aria-pressed", String(shouldShowPassword));
      el.loginPassword.focus();
    });
  }

  if (el.forgotPasswordBtn && el.loginEmail) {
    el.forgotPasswordBtn.addEventListener("click", async () => {
      if (!requireServices() || el.forgotPasswordBtn.disabled) return;
      const email = el.loginEmail.value.trim();

      if (!email) {
        showToast("Ingresá tu correo electrónico para recuperar la contraseña.");
        el.loginEmail.focus();
        return;
      }

      const originalText = el.forgotPasswordBtn.textContent;
      el.forgotPasswordBtn.disabled = true;
      el.forgotPasswordBtn.textContent = "Enviando correo…";

      try {
        await services.sendPasswordReset(email);
        showToast("Te enviamos un correo para recuperar tu contraseña. Revisá tu bandeja de entrada y también la carpeta Spam.");
      } catch (error) {
        showToast(error.message);
      } finally {
        el.forgotPasswordBtn.disabled = false;
        el.forgotPasswordBtn.textContent = originalText;
      }
    });
  }

  el.registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireServices()) return;
    const role = document.querySelector("input[name='registerRole']:checked").value;
    const payload = {
      name: document.getElementById("registerName").value.trim(),
      email: document.getElementById("registerEmail").value.trim(),
      password: document.getElementById("registerPassword").value,
      role
    };

    try {
      await services.registerAccount(payload);
      showToast(role === "delivery" ? "Cuenta creada. Un administrador debe aprobar tu perfil." : "Cuenta creada correctamente.");
    } catch (error) {
      showToast(error.message);
    }
  });

  el.logoutBtn.addEventListener("click", async () => {
    if (!requireServices()) return;
    await services.logoutAccount();
  });

  el.orderForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    console.log("submit crear pedido ejecutado");

    if (!requireServices()) return;
    if (!state.profile) {
      const error = new Error("No hay perfil cargado para crear el pedido.");
      console.error("error de crear pedido", error);
      showToast(error.message);
      return;
    }

    try {
      const payload = {
        clientId: state.profile.id,
        clientName: state.profile.name,
        category: document.getElementById("orderCategory").value,
        priority: document.getElementById("orderPriority").value,
        description: document.getElementById("orderDescription").value.trim(),
        address: document.getElementById("orderAddress").value.trim(),
        notes: document.getElementById("orderNotes").value.trim()
      };

      console.log("datos del pedido", payload);
      console.log("createOrder llamado");
      const result = await services.createOrder(payload);
      console.log("resultado Firestore crear pedido", result);
      el.orderForm.reset();
      showToast("Pedido creado. Los deliverys disponibles ya pueden verlo.");
    } catch (error) {
      console.error("error de Firestore al crear pedido", error);
      showToast(error.message);
    }
  });

  el.availabilityBtn.addEventListener("click", async () => {
    if (!requireServices()) return;
    if (!state.profile || state.profile.status !== "active") return;
    if (!canDeliveryWork(state.profile)) {
      showToast("Tu suscripción no está activa. Para volver a recibir pedidos, comunicate con el administrador.");
      return;
    }
    try {
      await services.setAvailability(state.profile.id, !state.profile.available);
      showToast(!state.profile.available ? "Ahora figurás disponible." : "Disponibilidad desactivada.");
    } catch (error) {
      showToast(error.message);
    }
  });

  if (el.deliverySubscriptionWhatsapp) {
    el.deliverySubscriptionWhatsapp.addEventListener("click", () => {
      if (!state.profile) return;
      const message = `Hola Juan Federico, soy ${state.profile.name || "delivery"}. Quiero renovar mi suscripción de ALTOQUE.`;
      window.open(`https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
    });
  }

  if (el.deliveryAvailableTab) {
    el.deliveryAvailableTab.addEventListener("click", () => selectDeliveryOrderTab("available"));
  }

  if (el.deliveryInProgressTab) {
    el.deliveryInProgressTab.addEventListener("click", () => selectDeliveryOrderTab("active"));
  }

  if (el.deliveryHistoryTab) {
    el.deliveryHistoryTab.addEventListener("click", () => selectDeliveryOrderTab("history"));
  }

  if (el.clientNotificationsBtn) {
    el.clientNotificationsBtn.addEventListener("click", async () => {
      if (!requireServices() || !state.profile || state.profile.role !== "cliente") return;

      try {
        const fcmToken = await services.enableNotifications(state.profile.id);
        state.profile = { ...state.profile, fcmToken };
        renderDashboard(state.profile, state.activePanel);
        showToast("Notificaciones activadas. Te avisaremos cuando tu pedido sea aceptado.");
      } catch (error) {
        showToast(error.message);
      }
    });
  }
  el.notificationsBtn.addEventListener("click", async () => {
    if (!requireServices() || !state.profile || state.profile.role !== "delivery") return;
    if (state.profile.status !== "active" || state.profile.suspended) return;

    try {
      await services.enableDeliveryNotifications(state.profile.id);
      showToast("Notificaciones activadas. Te avisaremos cuando haya pedidos disponibles.");
    } catch (error) {
      showToast(error.message);
    }
  });

  if (el.profilePhotoInput) {
    el.profilePhotoInput.addEventListener("change", async () => {
      if (!requireServices() || !state.profile) return;
      const file = el.profilePhotoInput.files && el.profilePhotoInput.files[0];
      if (!file) return;

      try {
        const photoURL = await services.uploadProfilePhoto(state.profile.id, file);
        state.profile = { ...state.profile, photoURL };
        renderDashboard(state.profile, state.activePanel);
        showToast("Foto de perfil actualizada.");
      } catch (error) {
        showToast(error.message);
      } finally {
        if (el.profilePhotoForm) el.profilePhotoForm.reset();
      }
    });
  }

  if (el.deleteProfilePhotoBtn) {
    el.deleteProfilePhotoBtn.addEventListener("click", async () => {
      if (!requireServices() || !state.profile || !state.profile.photoURL) return;
      const confirmed = confirm("¿Querés eliminar tu foto de perfil?");
      if (!confirmed) return;

      try {
        await services.deleteProfilePhoto(state.profile);
        const { photoURL, ...profileWithoutPhoto } = state.profile;
        state.profile = profileWithoutPhoto;
        renderDashboard(state.profile, state.activePanel);
        showToast("Foto de perfil eliminada.");
      } catch (error) {
        showToast(error.message);
      }
    });
  }

  el.messageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireServices()) return;
    const text = el.messageInput.value.trim();
    if (!text || !state.activeChatOrderId) return;
    try {
      await services.sendMessage(state.activeChatOrderId, state.profile, text);
      el.messageInput.value = "";
    } catch (error) {
      showToast(error.message);
    }
  });

  if (el.subscriptionModalClose && el.subscriptionModal) {
    el.subscriptionModalClose.addEventListener("click", () => {
      el.subscriptionModal.classList.add("hidden");
    });
  }


  if (el.storeForm) {
    el.storeForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!requireServices() || state.profile?.role !== "admin") return;

      const payload = {
        name: el.storeName.value.trim(),
        category: el.storeCategory.value.trim(),
        address: el.storeAddress.value.trim(),
        whatsapp: normalizeWhatsappInput(el.storeWhatsapp.value)
      };

      if (!payload.name || !payload.category || !payload.whatsapp) {
        showToast("Completá nombre, rubro y WhatsApp del comercio.");
        return;
      }

      try {
        if (state.editingStoreId) {
          await services.updateStore(state.editingStoreId, payload);
          showToast("Comercio actualizado.");
        } else {
          await services.saveStore(payload);
          showToast("Comercio guardado.");
        }
        resetStoreForm();
      } catch (error) {
        showToast(error.message);
      }
    });
  }

  if (el.storeCancelEditBtn) {
    el.storeCancelEditBtn.addEventListener("click", resetStoreForm);
  }
  el.subscriptionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireServices()) return;
    try {
      await services.saveSubscription({
        name: el.subscriptionName.value.trim(),
        price: Number(el.subscriptionPrice.value)
      });
      el.subscriptionForm.reset();
      showToast("Plan de suscripción guardado.");
    } catch (error) {
      showToast(error.message);
    }
  });
}

async function handleAuthChange(user) {
  clearAuthStartupTimeout();
  state.authReady = true;
  window.ALTOQUE_AUTH_READY = true;
  clearRealtimeListeners();

  if (!user) {
    state.authUser = null;
    state.profile = null;
    state.activeChatOrderId = null;
    navigate("landing");
    return;
  }

  try {
    const profile = await services.getProfile(user.uid);
    if (!profile || profile.suspended) {
      await services.logoutAccount();
      showToast("La cuenta no está habilitada para ingresar.");
      return;
    }

    state.authUser = user;
    state.profile = profile;
    state.activePanel = defaultPanelForRole(profile.role);
    renderDashboard(profile, state.activePanel);
    subscribeForRole(profile);
  } catch (error) {
    showToast(error.message);
  }
}

function subscribeForRole(profile) {
  state.listeners.push(services.watchStores((snapshot) => {
    const stores = normalizeSnapshot(snapshot);
    state.stores = stores;
    renderStores(stores, profile.role === "admin" ? adminHandlers : {});
  }));
  state.listeners.push(services.watchChatOrders(profile, (snapshot) => {
    const orders = normalizeSnapshot(snapshot);
    updateUnreadChats(orders);
    renderChatOrders(orders, state.activeChatOrderId, openChat);
  }));

  state.listeners.push(services.watchClientOrders(profile.id, (snapshot) => {
  const orders = normalizeSnapshot(snapshot);

  state.orders = orders;
  updateUnreadChats(orders);

  renderClientOrders(state.orders, orderHandlers);
  }));

  if (profile.role === "cliente") {
    state.listeners.push(services.watchForegroundMessages((payload) => {
      const data = payload.data || {};
      showToast(data.body || data.title || "Tenés una nueva notificación de ALTOQUE.");
    }));

    state.listeners.push(services.watchDeliveries((snapshot) => {
      const deliveries = normalizeSnapshot(snapshot);
      state.deliveryProfiles = deliveries.reduce((profiles, delivery) => {
        profiles[delivery.id] = delivery;
        return profiles;
      }, {});
      renderDeliveryRanking(deliveries);
      if (state.orders) renderClientOrders(state.orders, orderHandlers);
    }));
  }

  if (profile.role === "delivery") {
    state.listeners.push(services.watchForegroundMessages((payload) => {
      const data = payload.data || {};
      showToast(`${data.title || "Nuevo pedido disponible"}: ${data.category || ""} ${data.address || ""}`.trim());
    }));

    state.listeners.push(services.watchDeliveryOrders(profile.id, (snapshot) => {
      renderDeliveryOrders(normalizeSnapshot(snapshot), orderHandlers);
    }));

    state.listeners.push(services.watchAvailableOrders((snapshot) => {
      const currentProfile = state.profile || profile;
      const canAccept = currentProfile.status === "active" && currentProfile.available && canDeliveryWork(currentProfile);
      renderAvailableOrders(normalizeSnapshot(snapshot), orderHandlers, canAccept);
    }));

    state.listeners.push(services.watchUsers((snapshot) => {
      const users = normalizeSnapshot(snapshot);
      state.deliveryProfiles = users
        .filter((user) => user.role === "delivery")
        .reduce((profiles, delivery) => {
          profiles[delivery.id] = delivery;
          return profiles;
        }, {});
      const freshProfile = users.find((user) => user.id === profile.id);
      if (freshProfile) {
        state.profile = freshProfile;
        renderDashboard(freshProfile, state.activePanel);
      }
    }));
  }

  if (profile.role === "admin") {
    state.listeners.push(services.watchUsers((snapshot) => {
      const users = normalizeSnapshot(snapshot);
      state.adminUsers = users;
      renderAdminUsers(users, adminHandlers);
      renderSubscriptions(state.adminUsers || [], state.subscriptions || [], adminHandlers);
    }));
    state.listeners.push(services.watchAllOrders((snapshot) => {
      renderAdminOrders(normalizeSnapshot(snapshot), adminHandlers, appSettings.platformFee);
    }));
    state.listeners.push(services.watchSubscriptions((snapshot) => {
      const subscriptions = normalizeSnapshot(snapshot);
      state.subscriptions = subscriptions;
      renderSubscriptions(state.adminUsers || [], state.subscriptions || [], adminHandlers);
    }));
  }
}

async function acceptAvailableOrder(orderId) {
  if (!requireServices()) return;
  if (!canDeliveryWork(state.profile)) {
    showToast("Tu suscripción no está activa. Para volver a recibir pedidos, comunicate con el administrador.");
    return;
  }
  if (!state.profile.available) {
    showToast("Activá tu disponibilidad para aceptar pedidos.");
    return;
  }

  try {
    await services.acceptOrder(orderId, state.profile);
    showToast("Pedido aceptado. Coordiná por el chat interno.");
  } catch (error) {
    showToast(error.message);
  }
}

async function markOrder(orderId, status) {
  if (!requireServices()) return;
  try {
    await services.updateOrderStatus(orderId, status);
    showToast("Estado actualizado.");
  } catch (error) {
    showToast(error.message);
  }
}

async function cancelClientOrder(order) {
  if (!requireServices()) return;
  if (!state.profile || order.clientId !== state.profile.id || order.status !== "new") {
    showToast("Solo podés cancelar pedidos que todavía no fueron aceptados.");
    return;
  }

  const confirmed = confirm("¿Querés cancelar este pedido?");
  if (!confirmed) return;

  try {
    await services.cancelClientOrder(order);
    showToast("Pedido cancelado.");
  } catch (error) {
    showToast(error.message);
  }
}
async function rateCompletedOrder(orderId, rating) {
  if (!requireServices()) return;

  try {
    const order = state.orders.find(o => o.id === orderId);

    if (!order) {
      showToast("Pedido no encontrado");
      return;
    }

    if (order.status !== "completed") {
      showToast("Solo puedes calificar pedidos finalizados");
      return;
    }

    if (order.rating != null) {
      showToast("Este pedido ya fue calificado");
      return;
    }

    await services.rateOrder(orderId, rating);

    if (order.deliveryId) {
      await services.updateDeliveryRating(order.deliveryId, rating);
    }

    // 🔥 SOLO MARCAR LOCALMENTE
    order.rating = rating;

    showToast("Gracias por calificar al delivery 🎉");
    
  } catch (error) {
    showToast(error.message);
  }
}

async function openChat(order) {
  state.activeChatOrderId = order.id;
  state.activePanel = "chat";
  renderDashboard(state.profile, "chat");
  el.chatTitle.textContent = `${order.category} · ${order.description}`;
  el.chatSubtitle.textContent = `${order.clientName || "Cliente"} con ${order.deliveryName || "delivery sin asignar"}`;
  el.messageInput.disabled = false;
  el.sendMessageBtn.disabled = false;
  clearMessageListener();
  if (!requireServices()) return;
  markActiveChatRead(order.id);
  state.messageListener = services.watchMessages(order.id, (snapshot) => {
    renderMessages(normalizeSnapshot(snapshot));
  });
}

async function approvePendingDelivery(uid) {
  if (!requireServices()) return;
  try {
    await services.approveDelivery(uid);
    showToast("Delivery aprobado.");
  } catch (error) {
    showToast(error.message);
  }
}

async function suspendUser(user) {
  if (!requireServices()) return;
  try {
    await services.toggleSuspension(user);
    showToast(user.suspended ? "Usuario reactivado." : "Usuario suspendido.");
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteSubscription(subscriptionId) {
  if (!requireServices()) return;
  try {
    await services.removeSubscription(subscriptionId);
    showToast("Plan eliminado.");
  } catch (error) {
    showToast(error.message);
  }
}




async function assignSubscription(delivery, planId) {
  if (!requireServices()) return;
  const plan = (state.subscriptions || []).find((subscription) => subscription.id === planId);
  if (!plan) {
    showToast("Seleccioná un plan para asignar.");
    return;
  }

  try {
    await services.assignSubscriptionPlan(delivery.id, plan);
    el.subscriptionModal.classList.add("hidden");
    showToast("Plan asignado por 30 días.");
  } catch (error) {
    showToast(error.message);
  }
}

async function renewSubscription(delivery, planId) {
  if (!requireServices()) return;
  const selectedPlan = (state.subscriptions || []).find((subscription) => subscription.id === planId);

  try {
    await services.renewSubscriptionPlan(delivery, selectedPlan);
    el.subscriptionModal.classList.add("hidden");
    showToast("Suscripción renovada por 30 días.");
  } catch (error) {
    showToast(error.message);
  }
}


function editStore(store) {
  if (state.profile?.role !== "admin") return;
  state.editingStoreId = store.id;
  el.storeName.value = store.name || "";
  el.storeCategory.value = store.category || "";
  el.storeAddress.value = store.address || "";
  el.storeWhatsapp.value = store.whatsapp || "";
  el.storeSubmitBtn.textContent = "Actualizar comercio";
  el.storeCancelEditBtn.classList.remove("hidden");
  el.storeName.focus();
}

async function deleteStore(store) {
  if (!requireServices() || state.profile?.role !== "admin") return;
  const confirmed = confirm(`¿Querés eliminar ${store.name || "este comercio"}?`);
  if (!confirmed) return;

  try {
    await services.removeStore(store.id);
    if (state.editingStoreId === store.id) resetStoreForm();
    showToast("Comercio eliminado.");
  } catch (error) {
    showToast(error.message);
  }
}

function resetStoreForm() {
  state.editingStoreId = null;
  if (el.storeForm) el.storeForm.reset();
  if (el.storeSubmitBtn) el.storeSubmitBtn.textContent = "Guardar comercio";
  if (el.storeCancelEditBtn) el.storeCancelEditBtn.classList.add("hidden");
}

function normalizeWhatsappInput(value) {
  return String(value || "").replace(/\D/g, "");
}
function canDeliveryWork(profile) {
  if (!profile || !profile.subscriptionPlanId || !profile.subscriptionExpiresAt) return false;
  const expiresAt = profile.subscriptionExpiresAt.toDate
    ? profile.subscriptionExpiresAt.toDate()
    : new Date(profile.subscriptionExpiresAt);
  return expiresAt >= new Date();
}














function updateUnreadChats(orders = []) {
  if (!state.profile) return;
  state.unreadChatOrderIds = orders
    .filter((order) => isUnreadChat(order, state.profile.id))
    .map((order) => order.id);
}

function isUnreadChat(order, uid) {
  if (!order.lastMessageAt || order.lastMessageSenderId === uid) return false;
  const readAt = order.chatReadAt && order.chatReadAt[uid];
  return toMillis(order.lastMessageAt) > toMillis(readAt);
}

async function markActiveChatRead(orderId) {
  if (!state.profile || !orderId || !requireServices()) return;
  try {
    await services.markChatRead(orderId, state.profile.id);
    state.unreadChatOrderIds = state.unreadChatOrderIds.filter((id) => id !== orderId);
  } catch (error) {
    console.warn("No se pudo marcar el chat como leído:", error);
  }
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  return new Date(value).getTime() || 0;
}



