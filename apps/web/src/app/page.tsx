import { RunList } from '@/components/RunList';
import { StaticHome } from '@/components/StaticHome';
import { UploadForm } from '@/components/UploadForm';
import { STATIC_DEMO } from '@/lib/api';

export default function Home() {
  if (STATIC_DEMO) return <StaticHome />;
  return (
    <div className="home">
      <UploadForm />
      <RunList />
    </div>
  );
}
