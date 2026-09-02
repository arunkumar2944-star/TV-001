import {
  Activity,
  Building2,
  ChevronDown,
  CircleCheckBig,
  CircleUserRound,
  ClipboardCheck,
  LayoutDashboard,
  Newspaper,
  Send,
  Share2,
  SquarePen,
  Users,
} from 'lucide-react';

import { useState } from 'react';
import { NavLink } from 'react-router-dom';

import { getMenuForRole } from '../../config/menuConfig';

const ICONS = {
  Activity,
  Building2,
  CircleCheckBig,
  CircleUserRound,
  ClipboardCheck,
  LayoutDashboard,
  Newspaper,
  Send,
  Share2,
  SquarePen,
  Users,
};

export default function AppSidebar({ user }) {
  const menuItems = getMenuForRole(user?.role);

  const [openMenus, setOpenMenus] = useState({});

  function toggleMenu(id) {
    setOpenMenus((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand__logo">
          TV
        </div>

        <div>
          <strong>Trichy Vision</strong>

          <span>
            Publishing Platform
          </span>
        </div>
      </div>

      <div className="sidebar-user">
        <div className="sidebar-user__avatar">
          {user?.full_name
            ?.charAt(0)
            ?.toUpperCase() || 'U'}
        </div>

        <div>
          <strong>
            {user?.full_name || 'User'}
          </strong>

          <span>
            {formatRole(user?.role)}
          </span>
        </div>
      </div>

      <nav className="sidebar-navigation">
        {menuItems.map((item) => {
          const Icon = ICONS[item.icon];

          if (item.children) {
            const isOpen =
              openMenus[item.id] ?? true;

            return (
              <div
                key={item.id}
                className="sidebar-group"
              >
                <button
                  type="button"
                  className="sidebar-item"
                  onClick={() =>
                    toggleMenu(item.id)
                  }
                >
                  <span className="sidebar-item__main">
                    {Icon && <Icon size={19} />}

                    {item.label}
                  </span>

                  <ChevronDown
                    size={16}
                    className={
                      isOpen
                        ? 'sidebar-chevron sidebar-chevron--open'
                        : 'sidebar-chevron'
                    }
                  />
                </button>

                {isOpen && (
                  <div className="sidebar-submenu">
                    {item.children.map(
                      (child) => (
                        <NavLink
                          key={child.id}
                          to={child.path}
                          className={({ isActive }) =>
                            isActive
                              ? 'sidebar-subitem sidebar-subitem--active'
                              : 'sidebar-subitem'
                          }
                        >
                          {child.label}
                        </NavLink>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          }

          return (
            <NavLink
              key={item.id}
              to={item.path}
              className={({ isActive }) =>
                isActive
                  ? 'sidebar-item sidebar-item--active'
                  : 'sidebar-item'
              }
            >
              <span className="sidebar-item__main">
                {Icon && <Icon size={19} />}

                {item.label}
              </span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}

function formatRole(role) {
  if (!role) {
    return '';
  }

  return role
    .toLowerCase()
    .split('_')
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join(' ');
}