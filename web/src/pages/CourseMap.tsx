import { useParams } from 'react-router-dom';
import { CoursePath } from '../learn/CoursePath';

/**
 * A course's lesson path on a page of its own (/app/learn/course/:courseId):
 * the path (learn/CoursePath.tsx) under its header — the way back to Learn,
 * the course's name and how far through it the learner is, the other courses,
 * and the one button that carries on. Learn itself shows the same path
 * without the header (pages/Learn.tsx).
 */
export function CourseMap(): React.JSX.Element {
  const { courseId = '' } = useParams();
  return (
    <div className="container container-narrow">
      {/* each course is a path of its own: its scroll, its card and its way back start afresh */}
      <CoursePath key={courseId} courseId={courseId} />
    </div>
  );
}
