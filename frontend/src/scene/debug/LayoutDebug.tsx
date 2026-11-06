import { Html } from '@react-three/drei';
import { useMemo } from 'react';
import { BufferGeometry, Vector3 } from 'three';
import { anchors, stations, tables, waypoints, type Vec3 } from '../../data/layout';
import { useSceneStore } from '../../state/sceneStore';

const LABEL_STYLE = {
  font: '10px/1.2 ui-monospace, monospace',
  padding: '1px 3px',
  borderRadius: 3,
  color: '#fff',
  background: 'rgba(20, 30, 45, 0.78)',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
} as const;

function Label({ position, text }: { position: Vec3; text: string }) {
  return (
    <Html position={position} center zIndexRange={[5, 0]}>
      <div style={LABEL_STYLE}>{text}</div>
    </Html>
  );
}

const LIFT = 0.04;

function WaypointGraph() {
  const lines = useMemo(() => {
    const byId = new Map(waypoints.map((waypoint) => [waypoint.id, waypoint]));
    const points: Vector3[] = [];
    for (const waypoint of waypoints) {
      for (const linkId of waypoint.links) {
        if (waypoint.id > linkId) continue;
        const other = byId.get(linkId);
        if (!other) continue;
        points.push(
          new Vector3(waypoint.position[0], LIFT, waypoint.position[2]),
          new Vector3(other.position[0], LIFT, other.position[2]),
        );
      }
    }
    return new BufferGeometry().setFromPoints(points);
  }, []);

  return (
    <group raycast={() => null}>
      <lineSegments geometry={lines} raycast={() => null}>
        <lineBasicMaterial color="#17a673" depthTest={false} transparent />
      </lineSegments>
      {waypoints.map((waypoint) => (
        <mesh key={waypoint.id} position={waypoint.position} raycast={() => null}>
          <sphereGeometry args={[0.09, 12, 8]} />
          <meshBasicMaterial color="#17a673" depthTest={false} transparent />
        </mesh>
      ))}
    </group>
  );
}

function AnchorMarkers() {
  return (
    <group>
      {anchors.map((anchor) => (
        <mesh key={anchor.id} position={anchor.position} raycast={() => null}>
          <octahedronGeometry args={[0.16]} />
          <meshBasicMaterial color="#e23fb0" depthTest={false} transparent />
        </mesh>
      ))}
    </group>
  );
}

function InteractableLabels() {
  return (
    <>
      {stations.map((station) => (
        <Label
          key={station.id}
          position={[station.position[0], station.size[1] + 0.2, station.position[2]]}
          text={`${station.planNumber} ${station.id}`}
        />
      ))}
      {tables.map((table) => (
        <Label
          key={table.id}
          position={[table.position[0], 1.1, table.position[2]]}
          text={table.id}
        />
      ))}
    </>
  );
}

/** 개발용 오버레이. drei <Html>은 여기서만 쓴다. */
export function LayoutDebug() {
  const { showAnchors, showLabels, showWaypoints } = useSceneStore((state) => state.debug);
  return (
    <>
      {showWaypoints && <WaypointGraph />}
      {showAnchors && <AnchorMarkers />}
      {showLabels && <InteractableLabels />}
      {showLabels && showWaypoints &&
        waypoints.map((waypoint) => (
          <Label key={waypoint.id} position={waypoint.position} text={waypoint.id} />
        ))}
      {showLabels && showAnchors &&
        anchors.map((anchor) => (
          <Label
            key={anchor.id}
            position={[anchor.position[0], anchor.position[1] + 0.3, anchor.position[2]]}
            text={anchor.id}
          />
        ))}
    </>
  );
}
