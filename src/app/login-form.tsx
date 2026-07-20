'use client'

import { useActionState } from 'react'
import { login, type LoginState } from '@/lib/auth/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel, FieldError } from '@/components/ui/field'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const initialState: LoginState = {}

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState)

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>PanelSmart Admin</CardTitle>
        <CardDescription>Ingresa la contraseña para acceder al panel.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction}>
          <FieldGroup>
            <Field data-invalid={Boolean(state.error)}>
              <FieldLabel htmlFor="password">Contraseña</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoFocus
                aria-invalid={Boolean(state.error)}
              />
              {state.error ? <FieldError>{state.error}</FieldError> : null}
            </Field>
            <Button type="submit" disabled={pending}>
              {pending ? 'Ingresando…' : 'Ingresar'}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
