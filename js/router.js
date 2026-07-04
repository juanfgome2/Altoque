import { state } from "./state.js";
import { renderDashboard, renderLoadingView, renderPanel, renderPublicView } from "./render.js";

export function navigate(route) {
  if (!state.authReady) {
    renderLoadingView();
    return;
  }

  if (state.profile && ["client", "delivery", "admin", "subscriptions", "stores", "chat"].includes(route)) {
    state.activePanel = route;
    renderDashboard(state.profile, route);
    return;
  }

  state.activePanel = route;
  renderPublicView(route);
}

export function defaultPanelForRole(role) {
  if (role === "admin") return "admin";
  if (role === "delivery") return "delivery";
  return "client";
}

export function bindRouteEvents() {
  document.addEventListener("click", (event) => {
    const routeTarget = event.target.closest("[data-route]");
    const panelTarget = event.target.closest("[data-panel]");

    if (routeTarget) {
      if (!state.authReady) {
        event.preventDefault();
        renderLoadingView();
        return;
      }

      navigate(routeTarget.dataset.route);
    }

    if (panelTarget && state.profile) {
      state.activePanel = panelTarget.dataset.panel;
      renderDashboard(state.profile, state.activePanel);
      renderPanel(state.activePanel);
    }
  });
}





