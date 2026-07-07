importScripts(
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js"
);

firebase.initializeApp({
  apiKey: "AIzaSyCcfmEphvg16AHSsyIeaM-qDML-BMyqwnw",
  authDomain: "altoque-74f3d.firebaseapp.com",
  projectId: "altoque-74f3d",
  messagingSenderId: "495065761097",
  appId: "1:495065761097:web:6497f71535f99a153a8698"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  return self.registration.showNotification(data.title || "ALTOQUE", {
    body: data.body || [data.category, data.address].filter(Boolean).join(" · "),
    icon: "/icons/altoque-icon-192.png",
    data: { url: data.url || "/" }
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      if (clientList.length) return clientList[0].focus();
      return clients.openWindow(event.notification.data.url || "/");
    })
  );
});