'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  MessageSquare,
  ClipboardList,
  CalendarRange,
  LogOut,
  BookOpen,
  History,
  DoorOpen,
  Phone,
} from 'lucide-react'
import { logout } from '@/lib/auth/actions'
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
  SidebarRail,
} from '@/components/ui/sidebar'

const NAV_ITEMS = [
  { label: 'Conversaciones', href: '/admin/conversations', icon: MessageSquare },
  { label: 'Cuotas de reclutamiento', href: '/admin/quotas', icon: ClipboardList },
  { label: 'Periodos y cortes', href: '/admin/quotas/periodos', icon: CalendarRange },
  { label: 'Dashboard de leads', href: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Salas de chat', href: '/admin/rooms', icon: DoorOpen },
  { label: 'Números WhatsApp', href: '/admin/whatsapp-numbers', icon: Phone },
  { label: 'Historial de sincronización', href: '/admin/sync-history', icon: History },
  { label: 'Wiki del sistema', href: '/admin/wiki', icon: BookOpen },
] as const

/**
 * El href MÁS LARGO que matchea la ruta actual, y solo ese, queda resaltado.
 *
 * Un `pathname.startsWith(item.href)` por item resaltaba dos entradas a la vez en cuanto una ruta
 * quedó anidada bajo otra: en /admin/quotas/periodos se encendían "Cuotas de reclutamiento" y
 * "Periodos y cortes" juntas. Reordenar la lista no lo arregla — cada item evalúa por su cuenta.
 */
function activeHref(pathname: string): string | null {
  return (
    NAV_ITEMS.map((item) => item.href)
      .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
      .sort((a, b) => b.length - a.length)[0] ?? null
  )
}

export function AdminSidebar() {
  const pathname = usePathname()
  const active = activeHref(pathname)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <span className="truncate px-2 text-sm font-semibold group-data-[collapsible=icon]:hidden">
          PanelSmart Admin
        </span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={active === item.href}
                    tooltip={item.label}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <form action={logout}>
              <SidebarMenuButton type="submit" tooltip="Cerrar sesión">
                <LogOut />
                <span>Cerrar sesión</span>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
