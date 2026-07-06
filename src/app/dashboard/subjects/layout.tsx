import SubjectsSearch from '@/components/topics/SubjectsSearch'

export default function SubjectsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Subjects</h1>
        <SubjectsSearch />
        {children}
      </div>
    </div>
  )
}
