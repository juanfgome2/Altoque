



import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseApp, firestore, storage, auth, authApi, messagingApi, storageApi } from "./firebase.js";
import { firebaseMessagingConfig } from "./firebase-config.js";

export function watchAuth(callback, errorCallback) {
  return authApi.onAuthStateChanged(auth, callback, errorCallback);
}

export async function registerAccount({ name, email, password, role }) {
  const credential = await authApi.createUserWithEmailAndPassword(auth, email, password);
  const status = role === "delivery" ? "pending" : "active";
  await setDoc(doc(getCollection("users"), credential.user.uid), {
    name,
    email,
    role,
    status,
    available: false,
    suspended: false,
    ...(role === "delivery" ? { averageRating: 0, totalRatings: 0 } : {}),
    createdAt: serverTimestamp()
  });
  return credential.user;
}

export function loginAccount(email, password) {
  return authApi.signInWithEmailAndPassword(auth, email, password);
}

export function sendPasswordReset(email) {
  return authApi.sendPasswordResetEmail(auth, email, {
    url: "https://altoque-74f3d.web.app/",
    handleCodeInApp: false
  });
}

export function logoutAccount() {
  return authApi.signOut(auth);
}

export async function getProfile(uid) {
  const snapshot = await getDoc(doc(getCollection("users"), uid));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export function createOrder(payload) {
  console.log("createOrder llamado", payload);
  return addDoc(getCollection("orders"), {
    ...payload,
    status: "new",
    deliveryId: "",
    deliveryName: "",
    rating: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
    .then((result) => {
      console.log("resultado Firestore crear pedido", result);
      return result;
    })
    .catch((error) => {
      console.error("error de Firestore al crear pedido", error);
      throw error;
    });
}

export function acceptOrder(orderId, delivery) {
  return updateDoc(doc(getCollection("orders"), orderId), {
    status: "accepted",
    deliveryId: delivery.id,
    deliveryName: delivery.name,
    updatedAt: serverTimestamp()
  });
}

export function updateOrderStatus(orderId, status) {
  return updateDoc(doc(getCollection("orders"), orderId), {
    status,
    updatedAt: serverTimestamp()
  });
}

export async function cancelClientOrder(order) {
  if (order.status !== "new") {
    throw new Error("Solo podés cancelar pedidos que todavía no fueron aceptados.");
  }

  return updateDoc(doc(getCollection("orders"), order.id), {
    status: "cancelled",
    updatedAt: serverTimestamp()
  });
}

export function rateOrder(orderId, rating) {
  return updateDoc(doc(getCollection("orders"), orderId), {
    rating,
    ratedAt: serverTimestamp()
  });
}
export async function updateDeliveryRating(deliveryId, rating) {
  const deliveryRef = doc(getCollection("users"), deliveryId);

  const snapshot = await getDoc(deliveryRef);

  if (!snapshot.exists()) return;

  const data = snapshot.data();

  const totalRatings = data.totalRatings || 0;
  const averageRating = data.averageRating || 0;

  const newTotalRatings = totalRatings + 1;

  const newAverageRating =
    ((averageRating * totalRatings) + rating) /
    newTotalRatings;

  return updateDoc(deliveryRef, {
    totalRatings: newTotalRatings,
    averageRating: Number(newAverageRating.toFixed(2))
  });
}


export function setAvailability(uid, available) {
  return updateDoc(doc(getCollection("users"), uid), { available });
}

export async function uploadProfilePhoto(uid, file) {
  if (!file || !file.type.startsWith("image/")) {
    throw new Error("Seleccioná una imagen válida.");
  }

  const safeName = file.name.replace(/[^a-z0-9.-]/gi, "-").toLowerCase();
  const photoRef = storageApi.ref(storage, `profilePhotos/${uid}/${Date.now()}-${safeName}`);
  await storageApi.uploadBytes(photoRef, file, { contentType: file.type });
  const photoURL = await storageApi.getDownloadURL(photoRef);
  await updateDoc(doc(getCollection("users"), uid), { photoURL });
  return photoURL;
}
export async function deleteProfilePhoto(profile) {
  if (profile.photoURL) {
    try {
      const photoRef = storageApi.ref(storage, profile.photoURL);
      await storageApi.deleteObject(photoRef);
    } catch (error) {
      console.warn("No se pudo borrar el archivo de Storage:", error);
    }
  }

  await updateDoc(doc(getCollection("users"), profile.id), {
    photoURL: deleteField()
  });
}

export async function enableNotifications(uid) {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    throw new Error("Este navegador no admite notificaciones push.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Necesitás permitir las notificaciones para recibir pedidos.");
  }

  const serviceWorkerRegistration = await navigator.serviceWorker.ready;
  const messaging = messagingApi.getMessaging(firebaseApp);
  const fcmToken = await messagingApi.getToken(messaging, {
    vapidKey: firebaseMessagingConfig.vapidKey,
    serviceWorkerRegistration
  });

  if (!fcmToken) throw new Error("No se pudo obtener el token de notificaciones.");

  await updateDoc(doc(getCollection("users"), uid), { fcmToken });
  return fcmToken;
}

export function enableDeliveryNotifications(uid) {
  return enableNotifications(uid);
}

export function watchForegroundMessages(callback) {
  try {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return () => {};
    const messaging = messagingApi.getMessaging(firebaseApp);
    return messagingApi.onMessage(messaging, callback);
  } catch (error) {
    console.warn("FCM no está disponible en este navegador:", error);
    return () => {};
  }
}

export function approveDelivery(uid) {
  return updateDoc(doc(getCollection("users"), uid), {
    status: "active",
    suspended: false
  });
}



export function toggleSuspension(user) {
  return updateDoc(doc(getCollection("users"), user.id), {
    suspended: !user.suspended,
    status: !user.suspended ? "suspended" : "active",
    available: false
  });
}

export async function sendMessage(orderId, sender, text) {
  await addDoc(getCollection("messages"), {
    orderId,
    senderId: sender.id,
    senderName: sender.name,
    senderRole: sender.role,
    text,
    createdAt: serverTimestamp()
  });

  return updateDoc(doc(getCollection("orders"), orderId), {
    lastMessageAt: serverTimestamp(),
    lastMessageSenderId: sender.id,
    lastMessageText: text,
    updatedAt: serverTimestamp()
  });
}

export function markChatRead(orderId, uid) {
  return updateDoc(doc(getCollection("orders"), orderId), {
    [`chatReadAt.${uid}`]: serverTimestamp()
  });
}


export function saveStore({ name, category, address, whatsapp }) {
  return addDoc(getCollection("stores"), {
    name,
    category,
    address: address || "",
    whatsapp,
    active: true,
    createdAt: serverTimestamp()
  });
}

export function updateStore(storeId, { name, category, address, whatsapp }) {
  return updateDoc(doc(getCollection("stores"), storeId), {
    name,
    category,
    address: address || "",
    whatsapp,
    active: true,
    updatedAt: serverTimestamp()
  });
}

export function removeStore(storeId) {
  return deleteDoc(doc(getCollection("stores"), storeId));
}

export function watchStores(callback) {
  return onSnapshot(query(getCollection("stores"), orderBy("createdAt", "desc")), callback);
}
export function saveSubscription({ name, price }) {
  return addDoc(getCollection("subscriptions"), {
    name,
    price,
    active: true,
    createdAt: serverTimestamp()
  });
}

export function removeSubscription(subscriptionId) {
  return deleteDoc(doc(getCollection("subscriptions"), subscriptionId));
}
export function assignSubscriptionPlan(deliveryId, plan) {
  const startAt = new Date();
  const expiresAt = addDays(startAt, 30);

  return updateDoc(doc(getCollection("users"), deliveryId), {
    subscriptionPlanId: plan.id,
    subscriptionPlanName: plan.name,
    subscriptionPrice: Number(plan.price || 0),
    subscriptionStatus: "active",
    subscriptionStartAt: startAt,
    subscriptionExpiresAt: expiresAt
  });
}

export function renewSubscriptionPlan(delivery, plan) {
  const today = new Date();
  const currentExpiration = toDate(delivery.subscriptionExpiresAt);
  const baseDate = currentExpiration && currentExpiration > today ? currentExpiration : today;
  const expiresAt = addDays(baseDate, 30);
  const selectedPlan = plan || {
    id: delivery.subscriptionPlanId,
    name: delivery.subscriptionPlanName,
    price: delivery.subscriptionPrice
  };

  if (!selectedPlan.id || !selectedPlan.name) {
    throw new Error("Seleccioná un plan para renovar la suscripción.");
  }

  return updateDoc(doc(getCollection("users"), delivery.id), {
    subscriptionPlanId: selectedPlan.id,
    subscriptionPlanName: selectedPlan.name,
    subscriptionPrice: Number(selectedPlan.price || 0),
    subscriptionStatus: "active",
    subscriptionStartAt: today,
    subscriptionExpiresAt: expiresAt
  });
}

export function watchClientOrders(uid, callback) {
  return onSnapshot(
    query(getCollection("orders"), where("clientId", "==", uid), orderBy("createdAt", "desc")),
    callback
  );
}

export function watchAvailableOrders(callback) {
  return onSnapshot(
    query(getCollection("orders"), where("status", "==", "new"), orderBy("createdAt", "desc")),
    callback
  );
}

export function watchDeliveryOrders(uid, callback) {
  return onSnapshot(
    query(getCollection("orders"), where("deliveryId", "==", uid), orderBy("createdAt", "desc")),
    callback
  );
}

export function watchChatOrders(profile, callback) {
  if (profile.role === "cliente") {
    return watchClientOrders(profile.id, callback);
  }

  if (profile.role === "delivery") {
    return watchDeliveryOrders(profile.id, callback);
  }

  return onSnapshot(query(getCollection("orders"), orderBy("createdAt", "desc"), limit(60)), callback);
}



export function watchMessages(orderId, callback) {
  return onSnapshot(
    query(getCollection("messages"), where("orderId", "==", orderId), orderBy("createdAt", "asc")),
    callback
  );
}

export function watchUsers(callback) {
  return onSnapshot(query(getCollection("users"), orderBy("createdAt", "desc")), callback);
}

export function watchDeliveries(callback) {
  return onSnapshot(
    query(getCollection("users"), where("role", "==", "delivery")),
    callback
  );
}

export function watchAllOrders(callback) {
  return onSnapshot(query(getCollection("orders"), orderBy("createdAt", "desc"), limit(100)), callback);
}

export function watchSubscriptions(callback) {
  return onSnapshot(query(getCollection("subscriptions"), orderBy("createdAt", "desc")), callback);
}

export async function adminExists() {
  const snapshot = await getDocs(query(getCollection("users"), where("role", "==", "admin"), limit(1)));
  return !snapshot.empty;
}

function getCollection(name) {
  return collection(firestore, name);
}





function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function toDate(value) {
  if (!value) return null;
  return value.toDate ? value.toDate() : new Date(value);
}





