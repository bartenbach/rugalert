import { tb } from '@/lib/airtable'

export async function GET() {
  const rows: any[] = []
  
  // Use eachPage instead of firstPage to paginate properly
  await tb.events.select({
    filterByFormula: `{type} = "RUG"`,
    sort: [{ field: 'epoch', direction: 'desc' }],
    pageSize: 100,
  }).eachPage((records, fetchNextPage) => {
    rows.push(...records)
    fetchNextPage()
  })
  
  const header = ['vote_pubkey','epoch','from','to','delta']
  const data = rows.map(r => [r.get('votePubkey'), r.get('epoch'), r.get('fromCommission'), r.get('toCommission'), r.get('delta')])
  const csv = [header, ...data].map(r => r.join(',')).join('\n')
  return new Response(csv, { headers: { 'Content-Type': 'text/csv' } })
}
