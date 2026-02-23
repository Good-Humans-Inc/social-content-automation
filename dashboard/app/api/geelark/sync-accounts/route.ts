import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

interface GeeLarkPhone {
  id: string
  serialName?: string
  serialNo?: string
  status?: number | string
  remark?: string
  group?: {
    id?: string
    name?: string
  }
  tags?: Array<{ name?: string } | string>
  equipmentInfo?: {
    phoneNumber?: string
    countryName?: string
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phones } = body

    if (!phones || !Array.isArray(phones) || phones.length === 0) {
      return NextResponse.json(
        { error: 'No phones provided' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const syncedAccounts: any[] = []
    const errors: string[] = []

    for (const phone of phones) {
      try {
        // Generate account ID from phone ID
        const accountId = `account_${phone.id}`
        
        // Generate display name from serialName or serialNo or ID
        const displayName = phone.serialName || phone.serialNo || `Phone ${phone.id}`

        // Extract env_id - use phone ID as env_id (GeeLark uses phone ID as env_id)
        const envId = phone.id

        // Use phone ID as cloud_phone_id
        const cloudPhoneId = phone.id

        // Default persona (can be customized later)
        const persona = 'default'

        // Check if account already exists
        const { data: existing } = await supabase
          .from('accounts')
          .select('id')
          .eq('id', accountId)
          .maybeSingle()

        if (existing) {
          // Update existing account
          const { error: updateError } = await supabase
            .from('accounts')
            .update({
              display_name: displayName,
              env_id: envId,
              cloud_phone_id: cloudPhoneId,
              persona: persona,
            })
            .eq('id', accountId)

          if (updateError) {
            errors.push(`Failed to update account ${accountId}: ${updateError.message}`)
          } else {
            syncedAccounts.push({ id: accountId, action: 'updated' })
          }
        } else {
          // Create new account
          const { error: insertError } = await supabase
            .from('accounts')
            .insert({
              id: accountId,
              display_name: displayName,
              env_id: envId,
              cloud_phone_id: cloudPhoneId,
              persona: persona,
              preferred_fandoms: [],
              preferred_intensity: null,
              video_source: null,
            })

          if (insertError) {
            errors.push(`Failed to create account ${accountId}: ${insertError.message}`)
          } else {
            syncedAccounts.push({ id: accountId, action: 'created' })
          }
        }
      } catch (error: any) {
        errors.push(`Error processing phone ${phone.id}: ${error.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      synced: syncedAccounts.length,
      total: phones.length,
      accounts: syncedAccounts,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Error syncing accounts:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to sync accounts' },
      { status: 500 }
    )
  }
}
