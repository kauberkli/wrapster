import { BarChart3, Box, LayoutDashboard, ListTodo, LogOut, Package, PackageOpen, Tags } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'

import { JobIndicator } from '@/components/jobs/JobIndicator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { useAuth } from '@/contexts/AuthContext'

const navItems = [
  { titleKey: 'sidebar.dashboard', url: '/dashboard', icon: LayoutDashboard },
  { titleKey: 'sidebar.packaging', url: '/packaging', icon: Package },
  { titleKey: 'sidebar.unpack', url: '/unpack', icon: PackageOpen },
  { titleKey: 'sidebar.products', url: '/products', icon: Tags },
  { titleKey: 'sidebar.reports', url: '/reports', icon: BarChart3 },
  { titleKey: 'sidebar.jobs', url: '/jobs', icon: ListTodo },
]

export function AppSidebar() {
  const { t } = useTranslation()
  const location = useLocation()
  const { logout } = useAuth()
  const { setOpenMobile, isMobile } = useSidebar()

  const handleNavClick = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  const handleLogout = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
    logout()
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <Box className="size-5 shrink-0" />
          <span className="text-lg font-semibold group-data-[collapsible=icon]:hidden">
            Wrapster
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.titleKey}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.url}
                    tooltip={t(item.titleKey)}
                  >
                    <Link to={item.url} onClick={handleNavClick}>
                      <item.icon />
                      <span>{t(item.titleKey)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <JobIndicator />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} tooltip={t('sidebar.logout')} className="cursor-pointer">
              <LogOut />
              <span>{t('sidebar.logout')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
