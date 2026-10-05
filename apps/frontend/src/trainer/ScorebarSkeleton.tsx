import { Skeleton } from '../components/Loading.tsx';

/** Placeholder for the FastFold score bar; shares the real grid so nothing shifts when values arrive. */
export function ScorebarSkeleton() {
  return <div className="ff-scorebar ff-scorebar-skeleton" aria-hidden="true">
    {[44, 30, 30, 30, 30].map((height, index) => <div key={index}><Skeleton width={index ? '58%' : '46%'} height={9} /><Skeleton width={index ? '70%' : '62%'} height={height - 8} /></div>)}
  </div>;
}
